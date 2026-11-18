import test from "node:test";
import assert from "node:assert/strict";
import { gameAction, settleGame } from "../server/guild-games.js";
const now = Date.parse("2026-11-19T18:00:00+08:00");
function setup(kind = "prediction") {
  const s = {
    users: Array.from({ length: 6 }, (_, i) => ({
      id: `u${i}`,
      username: `Member${i}`,
      active: true,
      discordId: `12345678901234567${i}`,
    })),
    deliveries: [],
    discordWebhooks: {},
  };
  gameAction(
    s,
    s.users[0],
    "game.create",
    {
      kind,
      title: "公會測試",
      closesAt: new Date(now + 600000).toISOString(),
      riders: ["u1", "u2", "u3"],
    },
    now,
  );
  return s;
}
function join(s, i, optionId, amount = 10) {
  const id = s.gameRooms[0].id;
  gameAction(s, s.users[i], "game.join", { id, optionId, amount }, now + 1000);
  gameAction(
    s,
    s.users[0],
    "game.review",
    { id, userId: `u${i}`, approved: true },
    now + 2000,
  );
}
test("Prediction flow locks entries, allocates all coins once, and restricts host operations", () => {
  const s = setup(),
    id = s.gameRooms[0].id;
  join(s, 1, "yes", 40);
  join(s, 2, "yes", 30);
  join(s, 3, "no", 60);
  join(s, 4, "no", 20);
  assert.throws(
    () => gameAction(s, s.users[1], "game.lock", { id }, now + 3000),
    /房主/,
  );
  gameAction(s, s.users[0], "game.lock", { id }, now + 3000);
  assert.throws(
    () =>
      gameAction(
        s,
        s.users[5],
        "game.join",
        { id, optionId: "no", amount: 1 },
        now + 4000,
      ),
    /封盤/,
  );
  gameAction(s, s.users[0], "game.settle", { id, winner: "yes" }, now + 5000);
  assert.deepEqual(
    s.gameRooms[0].payouts.map((p) => p.amount),
    [86, 64],
  );
  assert.throws(
    () =>
      gameAction(
        s,
        s.users[0],
        "game.settle",
        { id, winner: "no" },
        now + 6000,
      ),
    /重複/,
  );
});
test("Race splits 1000 as 500/300/200 with rider shares and exact total", () => {
  const s = setup("race"),
    r = s.gameRooms[0];
  join(s, 4, "u1", 500);
  join(s, 5, "u2", 300);
  join(s, 0, "u3", 200);
  const payouts = settleGame(r, { places: ["u1", "u2", "u3"] });
  assert.equal(
    payouts.reduce((n, p) => n + p.amount, 0),
    1000,
  );
  assert.equal(payouts.find((p) => p.userId === "u1").amount, 100);
  assert.equal(payouts.find((p) => p.userId === "u4").amount, 400);
  assert.throws(() => settleGame(r, { places: ["u1", "u1", "u3"] }), /不同/);
});
test("Deadline excludes pending entries; unsupported result can be cancelled with exact refunds", () => {
  const s = setup(),
    r = s.gameRooms[0],
    id = r.id;
  join(s, 1, "yes", 11);
  gameAction(
    s,
    s.users[2],
    "game.join",
    { id, optionId: "no", amount: 90 },
    now + 3000,
  );
  assert.throws(
    () => gameAction(s, s.users[0], "game.lock", { id }, now + 4000),
    /待審核/,
  );
  gameAction(s, s.users[0], "game.state", {}, now + 600000);
  assert.equal(r.status, "locked");
  assert.equal(r.entries[1].status, "expired");
  assert.throws(
    () =>
      gameAction(
        s,
        s.users[0],
        "game.settle",
        { id, winner: "no" },
        now + 601000,
      ),
    /退回/,
  );
  gameAction(s, s.users[0], "game.cancel", { id }, now + 602000);
  assert.deepEqual(r.payouts, [{ userId: "u1", amount: 11, paidAt: null }]);
});
test("Reject invalid amounts and duplicate joins; hide another user's pending entry", () => {
  const s = setup(),
    id = s.gameRooms[0].id;
  for (const amount of [0, -1, 1.5, Infinity, 1000001])
    assert.throws(
      () =>
        gameAction(
          s,
          s.users[1],
          "game.join",
          { id, optionId: "yes", amount },
          now + 1000,
        ),
      /金額/,
    );
  gameAction(
    s,
    s.users[1],
    "game.join",
    { id, optionId: "yes", amount: 1 },
    now + 1000,
  );
  assert.throws(
    () =>
      gameAction(
        s,
        s.users[1],
        "game.join",
        { id, optionId: "yes", amount: 1 },
        now + 1000,
      ),
    /一次/,
  );
  assert.equal(
    gameAction(s, s.users[2], "game.state", {}, now + 1000).rooms[0].entries
      .length,
    0,
  );
  assert.throws(
    () =>
      gameAction(s, { ...s.users[1], discordId: "" }, "game.state", {}, now),
    /綁定/,
  );
});
