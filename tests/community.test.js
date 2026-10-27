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
test("groups enforce server-side visibility, consent, membership and owner-only invitations", () => {
  const { s, admin, a, b, c } = fixture();
  assert.deepEqual(
    publicState(s, a).characters.map((x) => x.ownerId),
    [a.id],
  );
  action(s, a, "group.create", { name: "一起冒險" });
  const g = s.groups[0];
  assert.throws(
    () => action(s, b, "group.invite", { groupId: g.id, username: c.username }),
    { status: 403 },
  );
  assert.throws(
    () => action(s, a, "group.invite", { groupId: g.id, username: "missing" }),
    { status: 404 },
  );
  action(s, a, "group.invite", { groupId: g.id, username: " bOB " });
  const invite = s.invitations[0];
  assert.equal(publicState(s, b).invitations[0].groupName, g.name);
  assert.equal(publicState(s, c).invitations.length, 0);
  assert.equal(publicState(s, b).characters.length, 1);
  assert.throws(
    () => action(s, c, "group.respond", { id: invite.id, accept: true }),
    { status: 404 },
  );
  assert.throws(
    () => action(s, a, "group.invite", { groupId: g.id, username: b.username }),
    { status: 409 },
  );
  action(s, b, "group.respond", { id: invite.id, accept: true });
  assert.equal(publicState(s, a).characters.length, 2);
  assert.equal(publicState(s, b).characters.length, 2);
  assert.equal(publicState(s, c).characters.length, 1);
  assert.equal(publicState(s, admin).characters.length, 3);
  assert.equal(
    publicState(s, b).users.find((u) => u.id === a.id).discordId,
    undefined,
  );
  action(s, b, "group.create", { name: "second" });
  assert.equal(publicState(s, b).groups.length, 2);
  assert.throws(
    () =>
      action(s, b, "character.complete", {
        id: s.characters[0].id,
        dungeonId: s.dungeons[0].id,
      }),
    { status: 403 },
  );
  action(s, a, "group.kick", { groupId: g.id, userId: b.id });
  assert.equal(publicState(s, b).characters.length, 1);
  assert.equal(publicState(s, b).groups.length, 1);
});
test("declining, leaving and owner disbanding remove invitations and visibility", () => {
  const { s, a, b, c } = fixture();
  action(s, a, "group.create", { name: "G" });
  const g = s.groups[0];
  action(s, a, "group.invite", { groupId: g.id, username: b.username });
  action(s, b, "group.respond", { id: s.invitations[0].id, accept: false });
  assert.equal(s.invitations.length, 0);
  action(s, a, "group.invite", { groupId: g.id, username: b.username });
  action(s, b, "group.respond", { id: s.invitations[0].id, accept: true });
  action(s, b, "group.leave", { groupId: g.id });
  assert.deepEqual(g.memberIds, [a.id]);
  action(s, a, "group.invite", { groupId: g.id, username: c.username });
  action(s, a, "group.leave", { groupId: g.id });
  assert.equal(s.groups.length, 0);
  assert.equal(s.invitations.length, 0);
});
test("accepting invitations preserves other invitations and supports multiple groups", () => {
  const { s, a, b, c } = fixture();
  action(s, a, "group.create", { name: "A" });
  action(s, c, "group.create", { name: "C" });
  for (const g of s.groups)
    action(
      s,
      s.users.find((u) => u.id === g.ownerId),
      "group.invite",
      { groupId: g.id, username: b.username },
    );
  const old = s.invitations[1].id;
  action(s, b, "group.respond", { id: s.invitations[0].id, accept: true });
  assert.equal(s.invitations.length, 1);
  action(s, b, "group.respond", { id: old, accept: true });
  assert.equal(publicState(s, b).groups.length, 2);
  assert.equal(publicState(s, b).characters.length, 3);
  assert.equal(publicState(s, a).characters.length, 2);
  assert.throws(
    () => action(s, b, "group.respond", { id: old, accept: true }),
    { status: 404 },
  );
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
    action(s, u, "group.create", { name: username });
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
