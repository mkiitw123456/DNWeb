import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  register,
  action,
  publicState,
  reset,
} from "../server/domain.js";
process.env.INITIAL_ADMIN_PASSWORD = "community-test";
function fixture() {
  const s = initialState(),
    admin = s.users[0];
  const a = register(s, { username: "Alice", password: "test" });
  const b = register(s, { username: "Bob", password: "test" });
  const c = register(s, { username: "Carol", password: "test" });
  for (const u of [a, b, c])
    action(s, u, "character.save", { name: u.username, hp: 1, attack: 2 });
  return { s, admin, a, b, c };
}
test("characters are private even for former group peers and administrators", () => {
  const { s, admin, a, b, c } = fixture();
  s.groups.push({
    id: "legacy",
    ownerId: a.id,
    memberIds: [a.id, b.id],
    name: "Old group",
  });
  s.invitations.push({
    id: "invite",
    groupId: "legacy",
    fromUserId: a.id,
    toUserId: c.id,
  });
  action(s, admin, "character.save", {
    name: "Admin character",
    hp: 1,
    attack: 1,
  });
  for (const user of [a, b, c, admin]) {
    const view = publicState(s, user);
    assert.deepEqual(
      view.characters.map((x) => x.ownerId),
      [user.id],
    );
    assert.deepEqual(view.groups, []);
    assert.deepEqual(view.invitations, []);
  }
  assert.deepEqual(
    publicState(s, a).users.map((x) => x.id),
    [a.id],
  );
  assert.equal(publicState(s, admin).users.length, 4);
  assert.equal(s.groups.length, 1);
});
test("all retired group actions reject even administrator requests", () => {
  const { s, a, admin } = fixture();
  for (const user of [a, admin])
    for (const type of ["create", "invite", "respond", "kick", "leave"])
      assert.throws(() => action(s, user, `group.${type}`, {}), {
        status: 410,
      });
});
test("onboarding completion belongs to the authenticated user and is idempotent", () => {
  const { s, a, b } = fixture();
  action(s, a, "onboarding.complete", { userId: b.id });
  action(s, a, "onboarding.complete", {});
  assert.equal(publicState(s, a).me.onboardingCompleted, true);
  assert.equal(publicState(s, b).me.onboardingCompleted, undefined);
});
test("bounties are global but edits are restricted; dungeon deletion cannot orphan a bounty", () => {
  const { s, admin, a, b } = fixture();
  action(s, a, "bounty.save", {
    name: "天啟一起打",
    dungeonId: s.dungeons[0].id,
    ownerId: b.id,
  });
  const item = s.bounties[0];
  assert.equal(item.ownerId, a.id);
  assert.equal(publicState(s, b).bounties[0].ownerName, "Alice");
  assert.throws(
    () => action(s, b, "bounty.save", { ...item, name: "stolen" }),
    { status: 403 },
  );
  assert.throws(() => action(s, b, "bounty.delete", { id: item.id }), {
    status: 403,
  });
  assert.throws(() =>
    action(s, admin, "dungeon.delete", { id: item.dungeonId }),
  );
  assert.throws(() =>
    action(s, a, "bounty.save", { name: "", dungeonId: item.dungeonId }),
  );
  assert.throws(() =>
    action(s, a, "bounty.save", { name: "test", dungeonId: "missing" }),
  );
  action(s, admin, "bounty.save", { ...item, name: "修正" });
  assert.equal(item.name, "修正");
  action(s, a, "bounty.delete", { id: item.id });
  assert.equal(s.bounties.length, 0);
});
test("profession migration preserves old IDs and does not resurrect deleted professions", () => {
  const { s } = fixture();
  s.professions = [{ id: "old", name: "Swordsman", color: "#fff" }];
  delete s.professionIconsMigrated;
  s.characters[0].professionId = "old";
  s.characters[0].fatigue = 700;
  reset(s);
  assert.equal(s.professions.length, 10);
  assert.equal(s.professions[0].icon, "/icons/Swordsman.png");
  assert.equal(s.characters[0].professionId, "old");
  assert.equal(s.characters[0].fatigue, undefined);
  action(s, s.users[0], "profession.delete", { id: "old" });
  reset(s);
  assert.equal(s.professions.length, 9);
});
test("complete dungeon uses server maximum and weekly reset still applies without fatigue", () => {
  const { s, a } = fixture();
  const character = s.characters[0],
    dungeon = s.dungeons[0];
  action(s, a, "character.complete", {
    id: character.id,
    dungeonId: dungeon.id,
    count: 999,
  });
  assert.equal(character.runs[dungeon.id], dungeon.max);
  reset(s, Date.now() + 8 * 86400000);
  assert.deepEqual(character.runs, {});
  assert.equal(character.fatigue, undefined);
});
test("account cleanup is admin-only, one-time and preserves other members and successor", () => {
  const { s, admin, a } = fixture();
  for (const username of ["Wolf", "shomen", "Avalon", "Ricky"]) {
    const u = register(s, { username, password: "test" });
    action(s, u, "character.save", { name: username, hp: 1, attack: 1 });
    s.groups.push({
      id: username,
      name: username,
      ownerId: u.id,
      memberIds: [u.id],
    });
    action(s, u, "bounty.save", {
      name: username,
      dungeonId: s.dungeons[0].id,
    });
  }
  assert.throws(
    () => action(s, a, "maintenance.cleanup", { confirm: "MrAirWolf" }),
    { status: 403 },
  );
  action(s, admin, "maintenance.cleanup", { confirm: "MrAirWolf" });
  assert.equal(s.users.length, 4);
  assert.equal(s.characters.length, 3);
  assert.equal(s.groups.length, 0);
  assert.equal(s.bounties.length, 0);
  assert.equal(s.users.find((u) => u.username === "MrAirWolf").admin, true);
  assert.throws(
    () => action(s, admin, "maintenance.cleanup", { confirm: "MrAirWolf" }),
    { status: 409 },
  );
});
test("cleanup requires an existing active successor before removing anyone", () => {
  const { s, admin } = fixture();
  admin.username = "Wolf";
  const original = structuredClone(s);
  assert.throws(
    () => action(s, admin, "maintenance.cleanup", { confirm: "MrAirWolf" }),
    { status: 409 },
  );
  assert.deepEqual(s, original);
});
