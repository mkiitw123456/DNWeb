import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
let child, folder, adminCookie, memberCookie;
const url = "http://127.0.0.1:5174/api/app";
async function call(type, payload, cookie) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ type, payload }),
  });
  return {
    status: response.status,
    data: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}
before(async () => {
  folder = await mkdtemp(join(tmpdir(), "dnweb-test-"));
  child = spawn(process.execPath, ["server/dev.js"], {
    env: {
      ...process.env,
      PORT: "5174",
      LOCAL_DATA_DIR: folder,
      INITIAL_ADMIN_PASSWORD: "test-password",
      SESSION_SECRET: "isolated-test-secret",
      FIREBASE_SERVICE_ACCOUNT_JSON: "",
      DISCORD_WEBHOOK_URL: "",
    },
    stdio: "pipe",
  });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(url);
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  assert.ok(ready, "test server started");
});
after(async () => {
  child?.kill();
  await new Promise((r) => setTimeout(r, 300));
  if (folder) await rm(folder, { recursive: true, force: true });
});
test("API login, member permissions, simultaneous sell/claim and durable data", async () => {
  assert.equal((await call("listing.sell", { id: "fake" })).status, 401);
  assert.equal(
    (await call("login", { username: "Wolf", password: "wrong" })).status,
    401,
  );
  const login = await call("login", {
    username: "Wolf",
    password: "test-password",
  });
  assert.equal(login.status, 200);
  adminCookie = login.cookie;
  const admin = login.data.me;
  const created = await call(
    "user.save",
    { username: "Alice", password: "simple", discordId: "123456789012345678" },
    adminCookie,
  );
  assert.equal(created.status, 200);
  const member = created.data.users.find((x) => x.username === "Alice");
  memberCookie = (
    await call("login", { username: "alice", password: "simple" })
  ).cookie;
  assert.equal(
    (await call("dungeon.save", { name: "forbidden", max: 2 }, memberCookie))
      .status,
    403,
  );
  assert.equal(
    (
      await call(
        "character.save",
        {
          name: "Alice character",
          hp: 100,
          fatigue: 20,
          attack: 10,
          ownerId: admin.id,
        },
        memberCookie,
      )
    ).data.characters[0].ownerId,
    member.id,
  );
  await call(
    "character.save",
    { name: "Admin character", hp: 100, fatigue: 20, attack: 10 },
    adminCookie,
  );
  const memberView = await fetch(url, {
    headers: { cookie: memberCookie },
  }).then((r) => r.json());
  assert.equal(memberView.characters.length, 2);
  const otherCharacter = memberView.characters.find(
    (c) => c.ownerId === admin.id,
  );
  assert.equal(
    (await call("character.save", { ...otherCharacter, hp: 999 }, memberCookie))
      .status,
    403,
  );
  assert.equal(
    (
      await call(
        "character.run",
        {
          id: otherCharacter.id,
          dungeonId: memberView.dungeons[0].id,
          count: 1,
        },
        memberCookie,
      )
    ).status,
    403,
  );
  assert.equal(JSON.stringify(memberView).includes("password"), false);
  const listed = await call(
    "listing.save",
    {
      name: "Test sword",
      price: 1001,
      cost: 100,
      taxed: true,
      participants: [admin.id, member.id],
    },
    adminCookie,
  );
  const listing = listed.data.listings[0];
  const sales = await Promise.all([
    call("listing.sell", { id: listing.id }, adminCookie),
    call("listing.sell", { id: listing.id }, adminCookie),
  ]);
  for (const sale of sales) assert.equal(sale.status, 200);
  const settlement = sales[1].data.settlements[0];
  assert.equal(sales[1].data.settlements.length, 1);
  assert.equal(settlement.notification, "unconfigured");
  assert.equal(
    settlement.payouts.reduce((n, p) => n + p.amount, 0),
    800,
  );
  assert.deepEqual(settlement.payouts.map((p) => p.amount), [400, 400]);
  assert.equal(settlement.remainder, 1);
  assert.equal(settlement.net, 801);
  assert.equal(
    (
      await call(
        "settlement.claim",
        { id: settlement.id, userId: admin.id },
        memberCookie,
      )
    ).status,
    403,
  );
  await Promise.all([
    call(
      "settlement.claim",
      { id: settlement.id, userId: admin.id },
      adminCookie,
    ),
    call(
      "settlement.claim",
      { id: settlement.id, userId: member.id },
      memberCookie,
    ),
  ]);
  const state = await fetch(url, { headers: { cookie: adminCookie } }).then(
    (r) => r.json(),
  );
  assert.ok(state.settlements[0].completedAt);
  const origin = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: adminCookie,
      origin: "https://wrong.example",
    },
    body: JSON.stringify({ type: "logout" }),
  });
  assert.equal(origin.status, 403);
  assert.equal(
    (await call("webhook.save", { url: "https://wrong.example" }, adminCookie))
      .status,
    400,
  );
  await call("user.save", { ...member, password: "changed" }, adminCookie);
  assert.equal(
    (await fetch(url, { headers: { cookie: memberCookie } })).status,
    401,
  );
});
