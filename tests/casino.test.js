import test from "node:test";
import assert from "node:assert/strict";
import { casinoAction, settleCasino, casinoDay } from "../server/casino.js";
const now = Date.parse("2026-11-17T12:00:00+08:00");
function setup() {
  const users = [0, 1, 2, 3].map((i) => ({
    id: "u" + i,
    username: "Member" + i,
    active: true,
    discordId: "12345678901234567" + i,
  }));
  return {
    users,
    deliveries: [],
    discordWebhooks: { casino: "https://discord.com/api/webhooks/example" },
  };
}
function create(s) {
  casinoAction(
    s,
    s.users[0],
    "casino.create",
    { title: "免費獎品", startsAt: new Date(now + 60000).toISOString() },
    now,
  );
  return s.casinoRooms[0];
}
test("Discord binding required; create validates dates and room limits", () => {
  const s = setup();
  assert.throws(
    () =>
      casinoAction(
        s,
        {
          ...s.users[0],
          discordId: "",
          discordPendingId: s.users[0].discordId,
        },
        "casino.state",
        {},
        now,
      ),
    /綁定/,
  );
  assert.throws(
    () =>
      casinoAction(
        s,
        s.users[0],
        "casino.create",
        { title: "x", startsAt: "bad" },
        now,
      ),
    /時間/,
  );
  create(s);
  create(s);
  create(s);
  assert.throws(() => create(s), /三個/);
});
test("Applications notify only specified Discord users; owner-only approval, no duplicate joins, private rejected applicants", () => {
  const s = setup(),
    r = create(s),
    u = s.users[1];
  casinoAction(s, u, "casino.join", { id: r.id }, now + 1);
  assert.deepEqual(s.deliveries[0].message.allowed_mentions, {
    parse: [],
    users: [s.users[0].discordId, u.discordId],
  });
  assert.throws(
    () => casinoAction(s, u, "casino.join", { id: r.id }, now + 2),
    /申請過/,
  );
  assert.throws(
    () =>
      casinoAction(
        s,
        u,
        "casino.review",
        { id: r.id, userId: u.id, approved: true },
        now + 2,
      ),
    /房主/,
  );
  assert.equal(
    casinoAction(s, s.users[2], "casino.state", {}, now + 2).rooms[0].entries
      .length,
    0,
  );
  casinoAction(
    s,
    s.users[0],
    "casino.review",
    { id: r.id, userId: u.id, approved: true },
    now + 3,
  );
  assert.equal(
    casinoAction(s, s.users[2], "casino.state", {}, now + 4).rooms[0].entries
      .length,
    1,
  );
});
test("Server draws once from approved active linked users, never pending; locks at deadline and delays result notification until animation ends", () => {
  const s = setup(),
    r = create(s);
  for (const u of s.users.slice(1))
    casinoAction(s, u, "casino.join", { id: r.id }, now + 1);
  casinoAction(
    s,
    s.users[0],
    "casino.review",
    { id: r.id, userId: "u1", approved: true },
    now + 2,
  );
  casinoAction(
    s,
    s.users[0],
    "casino.review",
    { id: r.id, userId: "u2", approved: true },
    now + 2,
  );
  s.users[2].active = false;
  settleCasino(s, now + 60000);
  assert.equal(r.winnerId, "u1");
  assert.equal(r.eligible.length, 1);
  const spin = structuredClone(r.spin);
  assert.ok(spin.duration >= 8500 && spin.duration <= 12500);
  assert.throws(
    () => casinoAction(s, s.users[3], "casino.join", { id: r.id }, now + 60000),
    /截止/,
  );
  const n = s.deliveries.length;
  settleCasino(s, now + 60001);
  assert.equal(s.deliveries.length, n);
  settleCasino(s, r.notifyAt);
  assert.equal(s.deliveries.length, n + 1);
  settleCasino(s, r.notifyAt + 1000);
  assert.equal(s.deliveries.length, n + 1);
  assert.deepEqual(r.spin, spin);
  assert.equal(r.winnerId, "u1");
  settleCasino(s, Date.parse("2026-11-18T09:00:00+08:00"));
  assert.equal(s.casinoRooms.length, 0);
});
test("Empty draw cancels; 09:00 history cleanup preserves future rooms", () => {
  const s = setup(),
    r = create(s);
  settleCasino(s, now + 60000);
  assert.equal(r.status, "cancelled");
  casinoAction(
    s,
    s.users[0],
    "casino.create",
    { title: "明天", startsAt: "2026-11-18T20:00:00+08:00" },
    now + 60001,
  );
  settleCasino(s, Date.parse("2026-11-18T09:00:00+08:00"));
  assert.equal(s.casinoRooms.length, 1);
  assert.equal(s.casinoRooms[0].status, "open");
  assert.notEqual(
    casinoDay(Date.parse("2026-11-18T08:59:59+08:00")),
    casinoDay(Date.parse("2026-11-18T09:00:00+08:00")),
  );
});
