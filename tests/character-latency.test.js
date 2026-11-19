import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("Character writes and account/admin forms return committed data while Discord remains blocked", async () => {
  const folder = await mkdtemp(join(tmpdir(), "dn-character-latency-"));
  process.env.LOCAL_DATA_DIR = folder;
  process.env.INITIAL_ADMIN_PASSWORD = "isolated-latency-test";
  process.env.SESSION_SECRET = "isolated-latency-session";
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  delete process.env.VERCEL;
  const { default: handler } = await import("../server/handler.js");
  const { transact } = await import("../server/store.js");
  async function call(type, payload = {}, cookie = "") {
    const headers = {};
    const res = {
      setHeader(k, v) {
        headers[k] = v;
      },
      status(code) {
        this.code = code;
        return this;
      },
      json(data) {
        this.data = data;
        return this;
      },
    };
    await handler(
      {
        method: "POST",
        headers: { cookie },
        body: { type, payload },
        url: "/api/app",
      },
      res,
    );
    return {
      status: res.code,
      data: res.data,
      cookie: headers["Set-Cookie"]?.split(";")[0],
    };
  }
  const originalFetch = globalThis.fetch;
  let release;
  let sent = 0;
  const gate = new Promise((r) => (release = r));
  try {
    const login = await call("login", {
      username: "MrAirWolf",
      password: "isolated-latency-test",
    });
    assert.equal(login.status, 200);
    await transact((s) => {
      s.discordWebhooks = {
        log: "https://discord.com/api/webhooks/123456789012345678/fake-log",
        important:
          "https://discord.com/api/webhooks/123456789012345678/fake-important",
      };
      s.quantityTypes = [{ id: "q", name: "票券" }];
      s.dungeons = [{ id: "d", name: "副本", max: 3 }];
    });
    globalThis.fetch = async () => {
      sent++;
      await gate;
      return { ok: false };
    };
    let timer;
    const start = performance.now();
    const saving = call(
      "character.save",
      { name: "延遲測試", hp: 1, attack: 1 },
      login.cookie,
    );
    const result = await Promise.race([
      saving,
      new Promise((r) => (timer = setTimeout(() => r(null), 700))),
    ]);
    clearTimeout(timer);
    assert.ok(
      result,
      "Saved character must be returned while Discord is still blocked",
    );
    assert.equal(result.status, 200);
    const character = result.data.characters.find((c) => c.name === "延遲測試");
    assert.ok(character);
    assert.equal(result.data.savedRecordId, character.id);
    const legacy = await call(
      "character.gear",
      { id: character.id, slot: "weapon", grade: "A" },
      login.cookie,
    );
    assert.equal(legacy.data.characters[0].gear.weapon, "A");
    const patch = {
      id: character.id,
      gear: { equipment: "S", accessory: "L" },
    };
    assert.equal((await call("character.gear", patch)).status, 401);
    const receipt = await call("character.gear", patch, login.cookie);
    assert.equal(receipt.status, 200);
    assert.deepEqual(receipt.data, {
      id: character.id,
      gear: { equipment: "S", weapon: "A", accessory: "L" },
    });
    for (const [type, payload] of [
      ["character.run", { id: character.id, dungeonId: "d", count: 1 }],
      ["character.complete", { id: character.id, dungeonId: "d" }],
      ["character.quantity", { id: character.id, typeId: "q", quantity: 7 }],
    ]) {
      const r = await call(type, payload, login.cookie);
      assert.equal(r.status, 200);
    }
    const stored = await transact((s) =>
      structuredClone(s.characters.find((c) => c.id === character.id)),
    );
    assert.equal(stored.runs.d, 3);
    assert.equal(stored.quantities.q, 7);
    assert.deepEqual(stored.gear, receipt.data.gear);
    const quickSave = (patch) =>
      call("character.quickSave", { id: character.id, ...patch }, login.cookie);
    const mixed = await quickSave({
      runs: { d: 1 },
      quantities: { q: 4 },
      gear: { weapon: null },
    });
    assert.equal(mixed.status, 200);
    assert.deepEqual(mixed.data, {
      id: character.id,
      runs: { d: 1 },
      quantities: { q: 4 },
      gear: { ...receipt.data.gear, weapon: null },
      week: character.week,
    });
    assert.equal((await quickSave({ runs: { d: "complete" } })).data.runs.d, 3);
    assert.equal(
      (await quickSave({ runs: { d: 0 }, quantities: { q: 1.5 } })).status,
      400,
    );
    const saved = await transact((s) =>
      s.characters.find((c) => c.id === character.id),
    );
    assert.equal(saved.runs.d, 3);
    assert.equal(saved.quantities.q, 4);
    console.log(
      "Committed character save response with blocked Discord:",
      Math.round(performance.now() - start),
      "ms (local test)",
    );
    const savedForms = await Promise.race([
      Promise.all([
        call("profile.nickname", { nickname: "新暱稱" }, login.cookie),
        call("dungeon.save", { name: "新副本", max: 3 }, login.cookie),
      ]),
      new Promise((resolve) => (timer = setTimeout(() => resolve(null), 700))),
    ]);
    clearTimeout(timer);
    assert.ok(
      savedForms,
      "Ordinary form saves must not wait for audit delivery",
    );
    assert.ok(savedForms.every((reply) => reply.status === 200));
    assert.doesNotMatch(JSON.stringify(savedForms), /fake-log|fake-important/);
    assert.equal(savedForms[0].data.me.nickname, "新暱稱");
    assert.ok(savedForms[1].data.dungeons.some((d) => d.name === "新副本"));
    assert.ok(
      await transact((s) =>
        s.deliveries.some((e) => e.message.content.includes("修改副本")),
      ),
    );
    release();
    for (let i = 0; i < 100; i++) {
      const complete = await transact((s) =>
        s.deliveries
          .filter((e) => e.channel === "important")
          .every((e) => e.status === "failed"),
      );
      if (complete) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.ok(sent >= 12);
    const failed = await transact((s) =>
      s.deliveries.find(
        (e) =>
          e.channel === "important" &&
          e.status === "failed" &&
          e.message.content.includes("修改副本"),
      ),
    );
    assert.ok(failed);
    let finishAudit;
    const slowAudit = new Promise((resolve) => (finishAudit = resolve));
    try {
      globalThis.fetch = async (_url, options) => {
        if (JSON.parse(options.body).content !== failed.message.content)
          await slowAudit;
        return { ok: true };
      };
      const retried = await Promise.race([
        call("delivery.retry", { id: failed.id }, login.cookie),
        new Promise(
          (resolve) => (timer = setTimeout(() => resolve(null), 700)),
        ),
      ]);
      clearTimeout(timer);
      assert.equal(
        retried?.data.deliveries.find((e) => e.id === failed.id)?.status,
        "sent",
      );
    } finally {
      finishAudit();
    }
  } finally {
    release();
    await new Promise((r) => setTimeout(r, 50));
    globalThis.fetch = originalFetch;
    await rm(folder, { recursive: true, force: true });
  }
});
