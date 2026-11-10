import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { transact } from "../server/store.js";
import { action, register, publicState } from "../server/domain.js";
import { audit } from "../server/scheduling.js";
import { deliverEvents } from "../server/deliveries.js";
test("separate Discord channels persist success, failure, retry and missing configuration without real network", async () => {
  const folder = await mkdtemp(join(tmpdir(), "dnweb-delivery-"));
  process.env.LOCAL_DATA_DIR = folder;
  process.env.INITIAL_ADMIN_PASSWORD = "test";
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = "";
  delete process.env.VERCEL;
  const originalFetch = globalThis.fetch;
  let requests = [];
  try {
    const ids = await transact((s) => {
      const owner = s.users[0];
      const a = register(s, { username: "Member", password: "test" });
      action(s, a, "character.save", {
        name: "Test character",
        hp: 1,
        attack: 1,
      });
      audit(s, a, "register", { username: a.username });
      audit(s, a, "character.save", { name: "Test character" });
      action(s, owner, "discordSettings.save", {
        channel: "log",
        url: "https://discord.com/api/webhooks/123456789012345678/log-token",
      });
      action(s, owner, "discordSettings.save", {
        channel: "raid",
        url: "https://discord.com/api/webhooks/123456789012345678/raid-token",
      });
      action(s, owner, "raid.save", {
        startsAt: new Date(Date.now() + 3600000).toISOString(),
        dungeonId: s.dungeons[0].id,
        slots: [s.characters[0].id, ...Array(7).fill(null)],
      });
      action(s, owner, "raid.notify", { id: s.raids[0].id, revision: 1 });
      return s.deliveries.map((e) => e.id);
    });
    globalThis.fetch = async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return { ok: !url.endsWith("raid-token") };
    };
    await deliverEvents(ids);
    assert.equal(requests.filter((r) => r.url.endsWith("log-token")).length, 2);
    assert.match(requests[0].body.content, /建立帳號/);
    assert.match(requests[1].body.content, /建立角色/);
    let view = await transact((s) => publicState(s, s.users[0]));
    assert.equal(view.raids[0].notification, "failed");
    globalThis.fetch = async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return { ok: true };
    };
    const retry = await transact((s) => {
      action(s, s.users[0], "raid.notify", { id: s.raids[0].id, revision: 1 });
      return s.deliveries.at(-1).id;
    });
    await Promise.all([deliverEvents([retry]), deliverEvents([retry])]);
    assert.equal(
      requests.filter((r) => r.url.endsWith("raid-token")).length,
      2,
    );
    view = await transact((s) => publicState(s, s.users[0]));
    assert.equal(view.raids[0].notification, "sent");
    const missing = await transact((s) => {
      s.discordWebhooks.raid = "";
      action(s, s.users[0], "raid.notify", { id: s.raids[0].id, revision: 1 });
      return s.deliveries.at(-1).id;
    });
    await deliverEvents([missing]);
    view = await transact((s) => publicState(s, s.users[0]));
    assert.equal(view.raids[0].notification, "unconfigured");
  } finally {
    globalThis.fetch = originalFetch;
    await rm(folder, { recursive: true, force: true });
  }
});
