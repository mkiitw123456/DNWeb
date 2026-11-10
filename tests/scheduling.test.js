import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  register,
  action,
  publicState,
  reset,
} from "../server/domain.js";
import { raidMessage, audit } from "../server/scheduling.js";
import {
  nextSevenDays,
  searchRoster,
  taipeiDay,
  mine,
} from "../shared/scheduling.js";
process.env.INITIAL_ADMIN_PASSWORD = "scheduling-tests";
function fixture() {
  const s = initialState(),
    owner = s.users[0];
  reset(s);
  const a = register(s, { username: "WolfPlayer", password: "test" }),
    b = register(s, { username: "Other", password: "test" });
  for (const [u, name, professionId] of [
    [a, "完全不同的名字", s.professions[0].id],
    [a, "Archer", s.professions[1].id],
    [b, "別人的角色", s.professions[0].id],
  ])
    action(s, u, "character.save", { name, professionId, hp: 1, attack: 1 });
  const draft = {
    startsAt: new Date(Date.now() + 3600000).toISOString(),
    dungeonId: s.dungeons[0].id,
    slots: [s.characters[0].id, s.characters[2].id, ...Array(6).fill(null)],
  };
  return { s, owner, a, b, draft };
}
test("only owner delegates roles; delegates cannot change owner or other administrators credentials", () => {
  const { s, owner, a, b } = fixture();
  action(s, owner, "user.role", { id: a.id, admin: true });
  assert.equal(a.admin, true);
  assert.equal(publicState(s, a).canDelegate, false);
  for (const type of [
    "user.role",
    "maintenance.promoteOwner",
    "maintenance.cleanup",
  ])
    assert.throws(
      () => action(s, a, type, { id: b.id, admin: true, confirm: "MrAirWolf" }),
      { status: 403 },
    );
  assert.throws(
    () => action(s, a, "user.save", { ...owner, password: "hacked" }),
    { status: 403 },
  );
  assert.throws(
    () => action(s, a, "user.save", { ...b, admin: true, password: "" }),
    { status: 403 },
  );
  assert.throws(() =>
    action(s, owner, "user.role", { id: owner.id, admin: false }),
  );
  action(s, owner, "user.role", { id: a.id, admin: false });
  assert.equal(a.admin, false);
  owner.username = "RenamedOwner";
  assert.equal(publicState(s, owner).canDelegate, true);
});
test("eight slots validate members, duplicate owners, dates and revisions; readers cannot mutate", () => {
  const { s, owner, a, b, draft } = fixture();
  for (const type of [
    "raid.save",
    "raid.delete",
    "raid.notify",
    "discordSettings.save",
    "delivery.retry",
  ])
    assert.throws(() => action(s, a, type, draft), { status: 403 });
  assert.throws(() => action(s, owner, "raid.save", { ...draft, slots: [] }));
  assert.throws(() =>
    action(s, owner, "raid.save", {
      ...draft,
      slots: [s.characters[0].id, s.characters[1].id, ...Array(6).fill(null)],
    }),
  );
  assert.throws(() =>
    action(s, owner, "raid.save", { ...draft, startsAt: "bad" }),
  );
  assert.throws(() =>
    action(s, owner, "raid.save", {
      ...draft,
      startsAt: new Date(Date.now() - 86400000).toISOString(),
    }),
  );
  action(s, owner, "raid.save", draft);
  const r = s.raids[0];
  assert.equal(r.slots.length, 8);
  assert.equal(publicState(s, a).raids.length, 1);
  assert.equal(publicState(s, a).roster.length, 0);
  assert.equal(publicState(s, owner).roster.length, 3);
  assert.equal(publicState(s, owner).characters.length, 0);
  assert.throws(
    () => action(s, owner, "raid.save", { ...draft, id: r.id, revision: 0 }),
    { status: 409 },
  );
  action(s, owner, "raid.save", { ...draft, id: r.id, revision: 1 });
  assert.equal(r.revision, 2);
  b.active = false;
  assert.throws(() =>
    action(s, owner, "raid.notify", { id: r.id, revision: r.revision }),
  );
  action(s, owner, "raid.delete", { id: r.id, revision: r.revision });
  assert.equal(s.raids.length, 0);
});
test("search matches any case-insensitive username or character fragment and applies profession filter", () => {
  const { s, a } = fixture();
  for (const q of ["W", "o", "l", "f", "wOlF"])
    assert.equal(
      searchRoster(s.characters, s.users, q, "").find((u) => u.id === a.id)
        .characters.length,
      2,
    );
  assert.equal(
    searchRoster(s.characters, s.users, "不同", "")[0].characters.length,
    1,
  );
  assert.equal(
    searchRoster(s.characters, s.users, "Wolf", s.professions[0].id)[0]
      .characters.length,
    1,
  );
  assert.equal(searchRoster(s.characters, s.users, "不存在", "").length, 0);
});
test("Taipei seven-day calendar handles month/year rollover and own participation", () => {
  assert.deepEqual(nextSevenDays(Date.parse("2026-12-31T17:00:00Z")), [
    "2027-01-01",
    "2027-01-02",
    "2027-01-03",
    "2027-01-04",
    "2027-01-05",
    "2027-01-06",
    "2027-01-07",
  ]);
  assert.equal(taipeiDay(Date.parse("2026-11-10T16:01:00Z")), "2026-11-11");
  const { s, owner, a, draft } = fixture();
  action(s, owner, "raid.save", draft);
  assert.equal(mine(s.raids[0], a.id), true);
  assert.equal(mine(s.raids[0], owner.id), false);
});
test("Discord format includes 24-hour Taipei time, countdown, eight slots, emoji and only participant mentions", () => {
  const { s, owner, a, draft } = fixture();
  a.discordId = "123456789012345678";
  owner.discordId = "123456789012345679";
  s.professions[0].discordEmoji = "<:sword:123456789012345680>";
  action(s, owner, "raid.save", draft);
  const r = s.raids[0];
  r.startsAt = Date.parse("2026-11-10T12:30:00Z");
  const message = raidMessage(s, r);
  assert.match(message.content, /2026-11-10 20:30/);
  assert.match(message.content, /<t:1794313800:R>/);
  assert.match(message.content, /<:sword:123456789012345680>/);
  assert.match(message.content, /8\. 待補/);
  assert.deepEqual(message.allowed_mentions, {
    parse: [],
    users: [a.discordId],
  });
});
test("webhooks and emojis validate; secrets never appear in public state or logs", () => {
  const { s, owner, draft } = fixture();
  for (const url of [
    "https://evil.example/",
    "http://discord.com/api/webhooks/123/token",
    "https://discord.com@evil.example/api/webhooks/123/token",
  ])
    assert.throws(() =>
      action(s, owner, "discordSettings.save", { channel: "log", url }),
    );
  const url =
    "https://discord.com/api/webhooks/123456789012345678/secret-token";
  action(s, owner, "discordSettings.save", { channel: "log", url });
  audit(s, owner, "user.save", {
    username: "NewUser",
    password: "never-log-password",
  });
  const view = JSON.stringify(publicState(s, owner));
  assert.ok(!view.includes("secret-token"));
  assert.ok(!view.includes("never-log-password"));
  const p = s.professions[0];
  assert.throws(() =>
    action(s, owner, "profession.save", { ...p, discordEmoji: "@everyone" }),
  );
  action(s, owner, "profession.save", {
    ...p,
    discordEmoji: "<a:sword:123456789012345678>",
  });
  action(s, owner, "raid.save", draft);
  const r = s.raids[0];
  action(s, owner, "raid.notify", { id: r.id, revision: 1 });
  assert.throws(
    () => action(s, owner, "raid.notify", { id: r.id, revision: 1 }),
    { status: 409 },
  );
  assert.throws(
    () => action(s, owner, "raid.save", { ...draft, id: r.id, revision: 1 }),
    { status: 409 },
  );
});
test("templates preserve eight positions without date, remain admin-only, and never overwrite source raids", () => {
  const { s, owner, a, draft } = fixture();
  action(s, owner, "raid.save", draft);
  const r = s.raids[0];
  assert.throws(
    () =>
      action(s, a, "raidTemplate.save", {
        raidId: r.id,
        revision: 1,
        name: "Team",
      }),
    { status: 403 },
  );
  action(s, owner, "raidTemplate.save", {
    raidId: r.id,
    revision: 1,
    name: "Team",
  });
  const t = s.raidTemplates[0];
  assert.equal(t.startsAt, undefined);
  assert.equal(t.slots.length, 8);
  assert.deepEqual(t.slots, draft.slots);
  assert.equal(publicState(s, a).raidTemplates.length, 0);
  assert.throws(() =>
    action(s, owner, "raidTemplate.save", {
      raidId: r.id,
      revision: 1,
      name: "Team",
    }),
  );
  action(s, owner, "raid.save", {
    slots: t.slots,
    dungeonId: t.dungeonId,
    startsAt: new Date(Date.now() + 86400000).toISOString(),
  });
  assert.equal(s.raids.length, 2);
  assert.equal(s.raids[0].revision, 1);
  assert.notEqual(s.raids[0].id, s.raids[1].id);
  s.characters = s.characters.filter((c) => c.id !== t.slots[0]);
  assert.throws(() =>
    action(s, owner, "raid.save", {
      slots: t.slots,
      dungeonId: t.dungeonId,
      startsAt: draft.startsAt,
    }),
  );
  action(s, owner, "raidTemplate.delete", { id: t.id });
  assert.equal(s.raidTemplates.length, 0);
  assert.equal(s.raids.length, 2);
});
