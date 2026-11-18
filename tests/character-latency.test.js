import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("Character writes return committed state without waiting for slow Discord; failed delivery remains retryable", async () => {
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
    console.log(
      "Committed character save response with blocked Discord:",
      Math.round(performance.now() - start),
      "ms (local test)",
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
    assert.ok(sent >= 8);
    assert.ok(
      await transact((s) =>
        s.deliveries.some(
          (e) => e.channel === "important" && e.status === "failed",
        ),
      ),
    );
  } finally {
    release();
    await new Promise((r) => setTimeout(r, 50));
    globalThis.fetch = originalFetch;
    await rm(folder, { recursive: true, force: true });
  }
});
