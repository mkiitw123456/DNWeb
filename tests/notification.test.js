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
      for (const username of ["A", "B", "C"])
        action(s, u, "user.save", { username, password: "test" });
      action(s, u, "listing.save", {
        name: "Sword",
        price: 73,
        cost: 0,
        taxed: true,
        participants: s.users.map((user) => user.id),
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
    let sentBody;
    globalThis.fetch = async (url, options) => {
      sent++;
      sentBody = JSON.parse(options.body);
      return { ok: false };
    };
    await notify(id);
    assert.deepEqual(sentBody.allowed_mentions.parse, []);
    assert.deepEqual(sentBody.allowed_mentions.users, ["123456789012345678"]);
    assert.equal((sentBody.content.match(/：16 金幣/g) || []).length, 4);
    assert.ok(!sentBody.content.includes("：17 金幣"));
    assert.ok(sentBody.content.includes("餘額 2 金幣留在公會共同倉庫"));
    assert.deepEqual(
      await transact((s) => s.settlements[0].payouts.map((p) => p.amount)),
      [16, 16, 16, 16],
    );
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
