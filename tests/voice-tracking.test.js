import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import {
  applyVoiceSnapshot,
  eligibleVoiceMembers,
  voiceView,
} from "../server/voice-tracking.js";
import handler from "../api/voice-ingest.js";
const now = Date.parse("2026-11-19T08:59:45+08:00"),
  channel = "123456789012345678",
  afk = "123456789012345679";
const members = [0, 1].map((i) => ({
  id: `23456789012345678${i}`,
  channelId: channel,
  bot: false,
}));
function snapshot(sequence = 1) {
  return {
    sessionId: "12345678-1234-1234-1234-123456789012",
    sequence,
    afkChannelId: afk,
    members,
  };
}
test("Voice tracks two humans, excludes solo/bots/AFK and splits Taipei 09:00 exactly", () => {
  let s = applyVoiceSnapshot(null, snapshot(), now);
  s = applyVoiceSnapshot(s, snapshot(2), now + 30000);
  assert.equal(s.totals[members[0].id], 30000);
  assert.equal(s.days["2026-11-18"][members[0].id], 15000);
  assert.equal(s.days["2026-11-19"][members[0].id], 15000);
  assert.deepEqual(eligibleVoiceMembers([members[0]], afk), []);
  assert.deepEqual(
    eligibleVoiceMembers([members[0], { ...members[1], bot: true }], afk),
    [],
  );
  assert.deepEqual(
    eligibleVoiceMembers(
      members.map((m) => ({ ...m, channelId: afk })),
      afk,
    ),
    [],
  );
  assert.equal(s.total, undefined); // No activity points or reward ledger touched.
});
test("Duplicate, missing sequence, restart, and prolonged outage never grant extra time", () => {
  let s = applyVoiceSnapshot(null, snapshot(), now);
  s = applyVoiceSnapshot(s, snapshot(2), now + 30000);
  assert.deepEqual(applyVoiceSnapshot(s, snapshot(2), now + 60000), s);
  s = applyVoiceSnapshot(s, snapshot(4), now + 60000);
  s = applyVoiceSnapshot(s, snapshot(5), now + 200000);
  s = applyVoiceSnapshot(
    s,
    { ...snapshot(1), sessionId: randomUUID() },
    now + 230000,
  );
  assert.equal(s.totals[members[0].id], 30000);
});
test("Leaving credits only previous valid interval and stops future solo accumulation", () => {
  let s = applyVoiceSnapshot(null, snapshot(), now);
  s = applyVoiceSnapshot(
    s,
    { ...snapshot(2), members: [members[0]] },
    now + 10000,
  );
  s = applyVoiceSnapshot(
    s,
    { ...snapshot(3), members: [members[0]] },
    now + 40000,
  );
  assert.equal(s.totals[members[0].id], 10000);
  assert.equal(s.totals[members[1].id], 10000);
});
test("Malformed and duplicate snapshot members rejected; only administrators see stats", async () => {
  assert.throws(() =>
    applyVoiceSnapshot(
      null,
      { ...snapshot(), members: [members[0], members[0]] },
      now,
    ),
  );
  await assert.rejects(() => voiceView({ admin: false }, [], now), /管理員/);
});
test("Voice ingest rejects unauthenticated, expired, wrong-guild and malformed signed reports before storage", async () => {
  process.env.DISCORD_BOT_TOKEN = "test-only-token";
  process.env.DISCORD_GUILD_ID = "123456789012345678";
  async function call(body, stamp = String(Date.now()), signature) {
    const res = {
      setHeader() {},
      status(n) {
        this.code = n;
        return this;
      },
      json(b) {
        this.body = b;
        return this;
      },
    };
    await handler(
      {
        method: "POST",
        headers: {
          "x-ddstar-timestamp": stamp,
          "x-ddstar-signature": signature,
        },
        body,
      },
      res,
    );
    return res.code;
  }
  assert.equal(await call({}), 401);
  const stamp = String(Date.now()),
    body = { guildId: "other" },
    sig = createHmac("sha256", process.env.DISCORD_BOT_TOKEN)
      .update(stamp + "." + JSON.stringify(body))
      .digest("hex");
  assert.equal(await call(body, stamp, sig), 403);
  assert.equal(await call(body, String(Date.now() - 120000), sig), 401);
});
