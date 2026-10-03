import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { notify } from "../server/handler.js";
import { transact } from "../server/store.js";
import { action } from "../server/domain.js";
test("Discord success, failure, retry and missing configuration persist without real network", async () => {
  const folder = await mkdtemp(join(tmpdir(), "dnweb-notify-"));
  process.env.LOCAL_DATA_DIR = folder;
  process.env.INITIAL_ADMIN_PASSWORD = "test";
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = "";
  process.env.DISCORD_WEBHOOK_URL = "";
  const original = globalThis.fetch;
  try {
    const id = await transact((s) => {
      const u = s.users[0];
      u.discordId = "123456789012345678";
      action(s, u, "listing.save", {
        name: "Sword",
        price: 100,
        cost: 0,
        taxed: true,
        participants: [u.id],
      });
      return action(s, u, "listing.sell", { id: s.listings[0].id });
    });
    await notify(id);
    assert.equal(
      await transact((s) => s.settlements[0].notification),
      "unconfigured",
    );
    await transact((s) => {
      s.webhook = "https://discord.com/api/webhooks/123/fake-test-token";
    });
    let sent = 0;
    globalThis.fetch = async (url, options) => {
      sent++;
      const body = JSON.parse(options.body);
      assert.deepEqual(body.allowed_mentions.parse, []);
      assert.deepEqual(body.allowed_mentions.users, ["123456789012345678"]);
      assert.ok(body.content.includes("90"));
      return { ok: false };
    };
    await notify(id);
    assert.equal(
      await transact((s) => s.settlements[0].notification),
      "failed",
    );
    globalThis.fetch = async () => {
      sent++;
      return { ok: true };
    };
    await notify(id);
    assert.equal(await transact((s) => s.settlements[0].notification), "sent");
    await notify(id);
    assert.equal(sent, 2);
  } finally {
    globalThis.fetch = original;
    await rm(folder, { recursive: true, force: true });
  }
});
