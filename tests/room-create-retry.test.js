import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { casinoAction } from "../server/casino.js";
import { duelAction } from "../server/duels.js";
import { gameAction } from "../server/guild-games.js";

const now = Date.parse("2026-11-19T12:00:00+08:00");
const cutoff = new Date(now + 60000).toISOString();
for (const [action, type, fields] of [
  [casinoAction, "casino.create", { startsAt: cutoff }],
  [duelAction, "duel.create", { side: "star" }],
  [gameAction, "game.create", { kind: "prediction", closesAt: cutoff }],
  [
    gameAction,
    "game.create",
    { kind: "race", closesAt: cutoff, riders: ["1", "2", "3"] },
  ],
]) {
  test(`${fields.kind || type} retries the same committed room without repeating notices`, () => {
    const users = [0, 1, 2, 3].map((i) => ({
      id: String(i),
      username: "member" + i,
      discordId: "12345678901234567" + i,
      active: true,
    }));
    const state = {
      users,
      deliveries: [],
      discordWebhooks: { casino: "https://discord.com/api/webhooks/example" },
    };
    const request = { ...fields, title: "房間", submissionId: randomUUID() };
    const first = action(state, users[0], type, request, now).rooms[0];
    const notices = state.deliveries.length;
    // The original cutoff is too close to accept as a new room at retry time.
    const retried = action(state, users[0], type, request, now + 1000);
    assert.deepEqual(
      retried.rooms.map((r) => r.id),
      [first.id],
    );
    assert.equal(state.deliveries.length, notices);
    assert.throws(
      () => action(state, users[0], type, { ...request, title: "修改" }, now),
      /先前送出的房間已建立/,
    );
    assert.throws(
      () =>
        action(
          state,
          users[0],
          type,
          { ...request, submissionId: "invalid" },
          now,
        ),
      /表單已失效/,
    );
    const other = action(state, users[1], type, request, now);
    assert.equal(new Set(other.rooms.map((r) => r.id)).size, 2);
    const fresh = action(
      state,
      users[0],
      type,
      { ...request, submissionId: randomUUID() },
      now,
    );
    assert.equal(fresh.rooms.length, 3);
  });
}
