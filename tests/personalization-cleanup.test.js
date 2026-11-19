import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initialState, register, action, reset } from "../server/domain.js";
import { removeUser, DEPLOYMENT_TEST } from "../server/user-deletion.js";
import {
  purgeActivityMember,
  drainUserDeletions,
  cleanupDeploymentTest,
  compactActivityHistory,
} from "../server/activity-maintenance.js";
import { activityAction, activityView } from "../server/activities.js";
import { activityTransaction } from "../server/activity-store.js";
import { transact } from "../server/store.js";
import { audit } from "../server/scheduling.js";
import { searchDiscordMembers } from "../server/discord-members.js";
let folder, s, owner, member, peer;
const now = Date.now();
before(async () => {
  folder = await mkdtemp(join(tmpdir(), "dnweb-cleanup-"));
  process.env.LOCAL_DATA_DIR = folder;
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = "";
  process.env.INITIAL_ADMIN_PASSWORD = "test-pass";
  s = initialState();
  owner = s.users[0];
  member = register(s, {
    username: DEPLOYMENT_TEST.username,
    password: "test",
  });
  member.id = DEPLOYMENT_TEST.id;
  peer = register(s, { username: "KeepMe", password: "test" });
  reset(s);
  await transact((state) => Object.assign(state, s));
});
after(async () => {
  await rm(folder, { recursive: true, force: true });
});
async function participate(u) {
  const v = await activityView(u, s.users, now),
    a = v.activities[0];
  return activityAction(
    u,
    s.users,
    "activity.submit",
    {
      submissionId: crypto.randomUUID(),
      activityId: a.id,
      version: a.version,
      day: a.day,
    },
    now,
  );
}
test("deletion rejects ordinary users, self, owner, mistyped names and unauthorized administrator deletion", () => {
  assert.throws(
    () => removeUser(s, peer, { id: member.id, username: member.username }),
    { status: 403 },
  );
  assert.throws(
    () => removeUser(s, owner, { id: owner.id, username: owner.username }),
    { status: 403 },
  );
  assert.throws(() =>
    removeUser(s, owner, { id: member.id, username: "wrong" }),
  );
  const delegate = { ...peer, admin: true };
  assert.throws(
    () => removeUser(s, delegate, { id: owner.id, username: owner.username }),
    { status: 403 },
  );
  assert.equal(s.users.length, 3);
});
test("audited activity changes revalidate the session version and admin role at commit", async () => {
  const write = (user) =>
    activityTransaction(
      () => assert.fail("stale authority must not enter the mutation"),
      {
        authenticatedUser: user,
        queueAudit: () => assert.fail("no audit expected"),
      },
    );
  await assert.rejects(write({ ...peer, admin: true }), { status: 403 });
  await assert.rejects(write({ ...peer, version: peer.version + 1 }), {
    status: 401,
  });
});
test("named deployment cleanup removes only exact account and all points, receipts, history, counters; retries are safe", async () => {
  const first = await participate(member);
  await participate(peer);
  await activityTransaction(async (db) => {
    db.set(`member_${member.id}/history/legacy`, first);
  });
  await cleanupDeploymentTest();
  await drainUserDeletions();
  await purgeActivityMember(member.id);
  const main = await transact((x) => x);
  assert.ok(!main.users.some((x) => x.id === member.id));
  assert.ok(main.users.some((x) => x.id === peer.id));
  assert.equal(main.pendingUserDeletions.length, 0);
  const stored = JSON.parse(
    await readFile(join(folder, "activities.json"), "utf8"),
  );
  assert.ok(!JSON.stringify(stored).includes(member.id));
  assert.equal(
    Object.keys(stored).filter((k) => k.startsWith("day_")).length,
    1,
  );
  assert.equal((await activityView(peer, main.users, now)).member.total, 5);
});
test("user deletion cascades related character, raid and group references, preserves others historical payouts", () => {
  const state = initialState(),
    admin = state.users[0],
    victim = register(state, { username: "DeleteMe", password: "test" }),
    survivor = register(state, { username: "Stay", password: "test" });
  reset(state);
  state.characters = [{ id: "c", ownerId: victim.id }];
  state.raids = [
    {
      id: "r",
      slots: [{ ownerId: victim.id, characterId: "c" }, null],
      createdBy: victim.id,
    },
  ];
  state.raidTemplates = [{ slots: ["c", null] }];
  state.settlements = [
    { ownerId: survivor.id, payouts: [{ userId: victim.id, amount: 12 }] },
  ];
  action(state, admin, "user.delete", {
    id: victim.id,
    username: victim.username,
  });
  assert.equal(state.characters.length, 0);
  assert.equal(state.raids[0].slots[0], null);
  assert.equal(state.raidTemplates[0].slots[0], null);
  assert.equal(state.settlements[0].payouts[0].amount, 12);
  assert.equal(state.settlements[0].payouts[0].userId, "deleted-account");
});
test("history compaction preserves totals while deleting old ledger and duplicated personal history", async () => {
  const record = {
    id: "old",
    memberId: peer.id,
    createdAt: now - 40 * 86400000,
    kind: "participation",
  };
  await activityTransaction(async (db) => {
    db.set("records/ledger/old", record);
    db.set(`member_${peer.id}/history/old`, record);
    db.set("receipt_old", { result: record });
  });
  await compactActivityHistory(now);
  const stored = JSON.parse(
    await readFile(join(folder, "activities.json"), "utf8"),
  );
  assert.equal(stored["records/ledger/old"], undefined);
  assert.equal(stored["receipt_old"], undefined);
  assert.ok(!Object.keys(stored).some((k) => k.includes("/history/")));
  assert.equal(stored[`member_${peer.id}`].total, 5);
});
test("notification channels cover actions, registration and admin mutations without exposing secrets; history remains bounded", () => {
  const state = initialState(),
    admin = state.users[0];
  reset(state);
  const ordinary = { id: "u", username: "member", admin: false };
  audit(state, ordinary, "register", { password: "secret" });
  assert.deepEqual(
    state.deliveries.map((x) => x.channel),
    ["log", "important"],
  );
  state.deliveries = [];
  audit(state, ordinary, "activity.submit", {});
  assert.deepEqual(
    state.deliveries.map((x) => x.channel),
    ["log"],
  );
  audit(state, admin, "activity.config", { url: "SECRET_WEBHOOK" });
  assert.deepEqual(
    state.deliveries.slice(-2).map((x) => x.channel),
    ["log", "important"],
  );
  assert.ok(!JSON.stringify(state.deliveries).includes("SECRET_WEBHOOK"));
  for (let i = 0; i < 100; i++) {
    state.deliveries.forEach((x) => (x.status = "sent"));
    audit(state, ordinary, "character.run", {});
  }
  assert.equal(state.deliveries.length, 30);
});
test("substring Discord search matches both Wo and lf, uses cached safe display data and excludes bots", async () => {
  process.env.DISCORD_BOT_TOKEN = "fake";
  process.env.DISCORD_GUILD_ID = "123456789012345678";
  let calls = 0;
  const fake = async () => {
    calls++;
    return {
      ok: true,
      json: async () => [
        {
          nick: "MrAirWolf",
          user: { id: "123456789012345679", username: "wolf_account" },
        },
        {
          nick: "WolfBot",
          user: { id: "123456789012345680", username: "bot", bot: true },
        },
      ],
    };
  };
  assert.equal(
    (await searchDiscordMembers("Wo", fake, now)).members[0].displayName,
    "MrAirWolf",
  );
  assert.equal((await searchDiscordMembers("lf", fake, now)).members.length, 1);
  assert.equal(calls, 1);
});
test("Discord binding requires server-verified membership and preserves uniqueness", () => {
  const state = initialState(),
    u = register(state, { username: "Person", password: "test" });
  reset(state);
  const discordId = "123456789012345679";
  assert.throws(
    () =>
      action(state, u, "profile.discordRequest", {
        discordId,
        verifiedDiscordId: discordId,
      }),
    { status: 403 },
  );
  action(state, u, "profile.discordRequest", { discordId }, Date.now(), {
    verifiedDiscordId: discordId,
  });
  assert.equal(u.discordId, discordId);
  assert.equal(u.discordPendingId, undefined);
  const other = register(state, { username: "Other", password: "test" });
  assert.throws(() =>
    action(state, other, "profile.discordRequest", { discordId }, Date.now(), {
      verifiedDiscordId: discordId,
    }),
  );
});
