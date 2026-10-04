import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  claimFromDiscord,
  handleDiscordRequest,
  validSignature,
} from "../server/discord-interactions.js";
import { saleMessage } from "../server/discord.js";
import { action } from "../server/domain.js";
import { transact } from "../server/store.js";
import { notify } from "../server/handler.js";

const appId = "111111111111111111",
  guildId = "222222222222222222",
  channelId = "333333333333333333",
  messageId = "444444444444444444";
const discordId = "555555555555555555";
function fixture() {
  return {
    users: [
      { id: "me", username: "Member", discordId, active: true, admin: true },
      { id: "peer", username: "Peer", active: true },
    ],
    characters: [],
    professions: [],
    settlements: [
      {
        id: "sale",
        name: "龍玉",
        discordClaimKey: "key",
        net: 33,
        discordMessage: { id: messageId, guildId, channelId },
        payouts: [
          { userId: "me", username: "Member", amount: 16, claimedAt: null },
          { userId: "peer", username: "Peer", amount: 16, claimedAt: null },
        ],
        completedAt: null,
      },
    ],
  };
}
function interaction() {
  return {
    id: "666666666666666666",
    application_id: appId,
    type: 3,
    token: "fake-token",
    guild_id: guildId,
    channel_id: channelId,
    member: { user: { id: discordId } },
    message: { id: messageId },
    data: { component_type: 2, custom_id: "dnclaim:sale:key" },
  };
}
test("Discord button claims only the clicked member, archives completion and is idempotent", () => {
  const s = fixture(),
    i = interaction();
  i.data.userId = "peer";
  assert.match(claimFromDiscord(s, i, 1000), /已確認領取：16/);
  assert.equal(s.settlements[0].payouts[0].claimedAt, 1000);
  assert.equal(s.settlements[0].payouts[1].claimedAt, null);
  assert.match(claimFromDiscord(s, i, 2000), /無須重複/);
  assert.equal(s.settlements[0].payouts[0].claimedAt, 1000);
  s.users[1].discordId = "777777777777777777";
  i.member.user.id = s.users[1].discordId;
  i.id = "888888888888888888";
  assert.match(claimFromDiscord(s, i, 3000), /歷史紀錄/);
  assert.equal(s.settlements[0].completedAt, 3000);
});
test("Discord rejects wrong message, server, channel, user binding, disabled users, stale and missing sales", () => {
  for (const change of [
    (s, i) => (i.message.id = "other"),
    (s, i) => (i.channel_id = "other"),
    (s, i) => (i.guild_id = "other"),
    (s, i) => (i.member.user.id = "other"),
    (s) => (s.users[0].active = false),
    (s) => (s.users[1].discordId = discordId),
    (s) => s.settlements[0].payouts.shift(),
    (s) => (s.settlements[0].discordClaimKey = "new"),
    (s) => (s.settlements = []),
  ]) {
    const s = fixture(),
      i = interaction();
    change(s, i);
    const before = structuredClone(s);
    assert.throws(() => claimFromDiscord(s, i));
    assert.deepEqual(s, before);
  }
});
test("replayed Discord event cannot undo an administrator's revocation", () => {
  const s = fixture(),
    i = interaction();
  claimFromDiscord(s, i, 1000);
  s.settlements[0].payouts[0].claimedAt = null;
  assert.throws(() => claimFromDiscord(s, i, 2000));
  assert.equal(s.settlements[0].payouts[0].claimedAt, null);
});
test("Discord message retains equal amounts and a shared self-claim button", () => {
  const s = fixture();
  const message = saleMessage(s.settlements[0], s.users, true);
  assert.equal(
    message.components[0].components[0].custom_id,
    "dnclaim:sale:key",
  );
  assert.equal(message.components[0].components[0].label, "確認領取");
  assert.equal((message.content.match(/：16 金幣/g) || []).length, 2);
  assert.match(message.content, /餘額 1 金幣由賣家保留/);
  assert.equal(saleMessage(s.settlements[0], s.users).components, undefined);
});
test("Discord endpoint checks exact raw-body signatures, timestamps and app identity before responding", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const hex = publicKey
    .export({ format: "der", type: "spki" })
    .subarray(-32)
    .toString("hex");
  process.env.DISCORD_PUBLIC_KEY = hex;
  process.env.DISCORD_APPLICATION_ID = appId;
  process.env.DISCORD_GUILD_ID = guildId;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const make = (body, time = timestamp) => {
    const raw = JSON.stringify(body);
    const headers = new Headers({
      "x-signature-timestamp": time,
      "x-signature-ed25519": sign(
        null,
        Buffer.from(time + raw),
        privateKey,
      ).toString("hex"),
    });
    return new Request("https://example.test/api/discord", {
      method: "POST",
      headers,
      body: raw,
    });
  };
  let scheduled = false;
  const schedule = () => {
    scheduled = true;
  };
  assert.deepEqual(
    await (
      await handleDiscordRequest(
        make({ type: 1, application_id: appId }),
        schedule,
      )
    ).json(),
    { type: 1 },
  );
  assert.equal(
    (
      await handleDiscordRequest(
        make({ type: 1, application_id: "wrong" }),
        schedule,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await handleDiscordRequest(
        make({ type: 1, application_id: appId }, "1000000000"),
        schedule,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await handleDiscordRequest(
        new Request("https://example.test", { method: "POST", body: "{}" }),
        schedule,
      )
    ).status,
    401,
  );
  const signed = make({ type: 1, application_id: appId });
  assert.equal(
    validSignature(Buffer.from('{"tampered":true}'), signed.headers, hex),
    false,
  );
  assert.equal(scheduled, false);
});
test("bot delivery persists message identity and signed interaction defers then saves receipt", async () => {
  const folder = await mkdtemp(join(tmpdir(), "dnweb-discord-"));
  const original = globalThis.fetch;
  process.env.LOCAL_DATA_DIR = folder;
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = "";
  process.env.INITIAL_ADMIN_PASSWORD = "test";
  process.env.DISCORD_BOT_TOKEN = "fake-bot-token";
  process.env.DISCORD_APPLICATION_ID = appId;
  process.env.DISCORD_GUILD_ID = guildId;
  process.env.DISCORD_CHANNEL_ID = channelId;
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  process.env.DISCORD_PUBLIC_KEY = publicKey
    .export({ format: "der", type: "spki" })
    .subarray(-32)
    .toString("hex");
  try {
    await transact((s) => Object.assign(s, fixture()));
    let sent;
    globalThis.fetch = async (url, opts) => {
      sent = { url, opts, body: JSON.parse(opts.body) };
      return { ok: true, json: async () => ({ id: messageId }) };
    };
    await notify("sale");
    assert.equal(
      sent.url,
      `https://discord.com/api/v10/channels/${channelId}/messages`,
    );
    assert.equal(sent.opts.headers.Authorization, "Bot fake-bot-token");
    assert.equal(sent.body.enforce_nonce, true);
    const saved = await transact((s) => s.settlements[0]);
    assert.equal(saved.notification, "sent");
    assert.equal(saved.discordMessage.id, messageId);
    const raw = JSON.stringify(interaction()),
      timestamp = String(Math.floor(Date.now() / 1000));
    const request = new Request("https://example.test/api/discord", {
      method: "POST",
      body: raw,
      headers: {
        "x-signature-timestamp": timestamp,
        "x-signature-ed25519": sign(
          null,
          Buffer.from(timestamp + raw),
          privateKey,
        ).toString("hex"),
      },
    });
    let job;
    const response = await handleDiscordRequest(
      request,
      (promise) => (job = promise),
    );
    assert.deepEqual(await response.json(), { type: 5, data: { flags: 64 } });
    await job;
    assert.equal(sent.opts.method, "PATCH");
    assert.match(sent.body.content, /已確認領取：16/);
    assert.ok(await transact((s) => s.settlements[0].payouts[0].claimedAt));
  } finally {
    globalThis.fetch = original;
    await rm(folder, { recursive: true, force: true });
  }
});
