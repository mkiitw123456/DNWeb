import test from "node:test";
import assert from "node:assert/strict";
import { duelAction } from "../server/duels.js";
import { verifyDiscordMember } from "../server/discord-members.js";
const make = () => ({
  users: [0, 1, 2].map((i) => ({
    id: `u${i}`,
    username: `member${i}`,
    nickname: `nickname${i}`,
    active: true,
    discordId: `12345678901234567${i}`,
  })),
  deliveries: [],
});
test("Coin room limits, host authorization, timeout and immutable result", () => {
  const s = make(),
    [host, guest, other] = s.users,
    time = 1000000;
  duelAction(s, host, "duel.create", { title: "Coin", side: "star" }, time);
  const id = s.duels[0].id;
  assert.throws(() => duelAction(s, host, "duel.join", { id }, time));
  duelAction(s, guest, "duel.join", { id }, time);
  assert.throws(() => duelAction(s, other, "duel.join", { id }, time));
  assert.throws(() => duelAction(s, guest, "duel.accept", { id }, time));
  assert.equal(
    duelAction(s, host, "duel.state", {}, time + 100000).rooms[0].status,
    "open",
  );
  duelAction(s, guest, "duel.join", { id }, time + 100001);
  const accepted = duelAction(s, host, "duel.accept", { id }, time + 100002)
    .rooms[0];
  assert.equal(accepted.outcome, undefined);
  assert.throws(() =>
    duelAction(s, guest, "duel.leave", { id }, time + 100003),
  );
  assert.throws(() =>
    duelAction(s, host, "duel.accept", { id }, time + 100003),
  );
  const spin = duelAction(s, host, "duel.state", {}, accepted.startsAt)
    .rooms[0];
  assert.ok(spin.turns >= 8 && spin.turns <= 12);
  assert.ok(["star", "moon"].includes(spin.outcome));
  const completed = duelAction(s, guest, "duel.state", {}, accepted.endsAt)
    .rooms[0];
  assert.equal(
    completed.winnerId,
    spin.outcome === "star" ? host.id : guest.id,
  );
  const notices = s.deliveries.length;
  assert.equal(
    duelAction(s, guest, "duel.state", {}, accepted.endsAt + 100).rooms[0]
      .winnerId,
    completed.winnerId,
  );
  assert.equal(s.deliveries.length, notices);
  assert.equal(completed.ownerName, host.nickname);
});
test("Discord membership verifies exact human ID and handles departed members", async () => {
  process.env.DISCORD_BOT_TOKEN = "test";
  process.env.DISCORD_GUILD_ID = "123456789012345678";
  const id = "223456789012345678";
  assert.equal(
    await verifyDiscordMember(id, async () => ({
      ok: true,
      json: async () => ({ user: { id, bot: false } }),
    })),
    id,
  );
  await assert.rejects(
    verifyDiscordMember(id, async () => ({ ok: false, status: 404 })),
  );
  await assert.rejects(
    verifyDiscordMember(id, async () => ({
      ok: true,
      json: async () => ({ user: { id, bot: true } }),
    })),
  );
  await assert.rejects(
    verifyDiscordMember(id, async () => ({ ok: false, status: 429 })),
  );
});
