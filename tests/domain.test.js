import test from "node:test";
import assert from "node:assert/strict";
import {
  periods,
  reset,
  split,
  action,
  initialState,
  publicState,
  matches,
} from "../server/domain.js";
process.env.INITIAL_ADMIN_PASSWORD = "test-password";
const before = Date.parse("2026-10-03T08:59:59+08:00"),
  after = Date.parse("2026-10-03T09:00:00+08:00");
test("Taipei 09:00 daily and Saturday weekly boundaries, including missed weeks", () => {
  assert.equal(periods(after).day - periods(before).day, 1);
  assert.equal(periods(after).week - periods(before).week, 1);
  assert.equal(periods(after + 86400000).week, periods(after).week);
  const s = {
    characters: [{ ...periods(before), fatigue: 12, runs: { d: 3 } }],
  };
  reset(s, before);
  assert.equal(s.characters[0].fatigue, 12);
  reset(s, after);
  assert.equal(s.characters[0].fatigue, 700);
  assert.deepEqual(s.characters[0].runs, {});
  s.characters[0].fatigue = 100;
  s.characters[0].runs.d = 2;
  reset(s, after + 1000);
  assert.equal(s.characters[0].fatigue, 100);
  reset(s, after + 86400000);
  assert.equal(s.characters[0].runs.d, 2);
  reset(s, after + 21 * 86400000);
  assert.deepEqual(s.characters[0].runs, {});
});
test("integer split preserves every coin, tax optional and invalid data rejected", () => {
  const r = split(1001, 100, true, ["a", "b", "c"]);
  assert.equal(r.tax, 100);
  assert.equal(r.net, 801);
  assert.equal(
    r.payouts.reduce((n, p) => n + p.amount, 0),
    801,
  );
  assert.deepEqual(
    split(10, 0, false, ["a", "b", "c"]).payouts.map((x) => x.amount),
    [4, 3, 3],
  );
  for (const args of [
    [1, 2, false, ["a"]],
    [10, 0, true, []],
    [10, 0, true, ["a", "a"]],
    [-1, 0, true, ["a"]],
    [1.5, 0, true, ["a"]],
  ])
    assert.throws(() => split(...args));
});
test("accounts hash passwords, duplicate case insensitive names rejected, admin protected", () => {
  const s = initialState(),
    u = s.users[0];
  assert.ok(matches("test-password", u.password));
  action(s, u, "user.save", {
    username: "Alice",
    password: "simple",
    discordId: "123456789012345678",
  });
  assert.throws(() =>
    action(s, u, "user.save", { username: "alice", password: "simple" }),
  );
  assert.throws(() =>
    action(s, u, "user.save", {
      id: u.id,
      username: u.username,
      active: false,
    }),
  );
  assert.equal(JSON.stringify(publicState(s, u)).includes("password"), false);
  assert.throws(() =>
    action(s, s.users[1], "dungeon.save", { name: "x", max: 3 }),
  );
});
test("characters, permissions, dungeon bounds and lowering maximum", () => {
  const s = initialState(),
    u = s.users[0];
  action(s, u, "user.save", { username: "A", password: "x" });
  const member = s.users[1];
  action(
    s,
    member,
    "character.save",
    { name: "hero", hp: 100, attack: 50, fatigue: 20 },
    after,
  );
  const c = s.characters[0],
    d = s.dungeons[0];
  assert.equal(c.ownerId, member.id);
  action(
    s,
    member,
    "character.run",
    { id: c.id, dungeonId: d.id, count: 7 },
    after,
  );
  assert.throws(() =>
    action(
      s,
      member,
      "character.run",
      { id: c.id, dungeonId: d.id, count: 8 },
      after,
    ),
  );
  action(s, u, "dungeon.save", { ...d, max: 2 }, after);
  assert.equal(c.runs[d.id], 2);
  assert.throws(() =>
    action(s, { id: "other" }, "character.delete", { id: c.id }, after),
  );
});
test("sale is idempotent, only recipient/admin can claim, archive then reopen", () => {
  const s = initialState(),
    u = s.users[0];
  action(s, u, "user.save", { username: "A", password: "x" });
  const member = s.users[1];
  action(s, u, "listing.save", {
    name: "Sword",
    price: 101,
    cost: 0,
    taxed: true,
    participants: [u.id, member.id],
  });
  const listing = s.listings[0];
  const id = action(s, u, "listing.sell", { id: listing.id });
  assert.equal(action(s, u, "listing.sell", { id: listing.id }), id);
  assert.equal(s.settlements.length, 1);
  assert.throws(() =>
    action(s, member, "settlement.claim", { id, userId: u.id }),
  );
  action(s, member, "settlement.claim", { id, userId: member.id });
  assert.equal(s.settlements[0].completedAt, null);
  assert.throws(() =>
    action(s, u, "settlement.edit", {
      id,
      name: "a",
      price: 10,
      cost: 0,
      taxed: false,
    }),
  );
  action(s, u, "settlement.claim", { id, userId: u.id });
  assert.ok(s.settlements[0].completedAt);
  action(s, u, "settlement.claim", { id, userId: u.id, claimed: false });
  assert.equal(s.settlements[0].completedAt, null);
});
