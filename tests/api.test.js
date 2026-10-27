import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
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
    setCookie: response.headers.get("set-cookie"),
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

test("public registration logs in, prevents duplicate accounts and persists a renewable session", async () => {
  const registered = await call("register", {
    username: " NewMember ",
    password: " password with spaces ",
    admin: true,
    active: false,
    discordId: "123456789012345678",
  });
  assert.equal(registered.status, 200);
  const token = JSON.parse(
    Buffer.from(registered.cookie.split("=")[1].split(".")[0], "base64url"),
  );
  assert.equal(token.persistent, true);
  assert.equal(token.exp, undefined);
  assert.equal(registered.data.me.username, "NewMember");
  assert.equal(registered.data.me.admin, false);
  assert.equal(registered.data.me.active, true);
  assert.equal(registered.data.me.discordId, "");
  assert.equal(JSON.stringify(registered.data).includes("password"), false);
  assert.match(
    registered.setCookie,
    /HttpOnly; SameSite=Lax; Max-Age=34560000/,
  );
  const restored = await fetch(url, { headers: { cookie: registered.cookie } });
  assert.equal(restored.status, 200);
  assert.equal((await restored.json()).me.id, registered.data.me.id);
  assert.match(restored.headers.get("set-cookie"), /Max-Age=34560000/);
  assert.equal(
    (
      await call(
        "dungeon.save",
        { name: "forbidden", max: 1 },
        registered.cookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call("login", {
        username: "newmember",
        password: " password with spaces ",
      })
    ).status,
    200,
  );
  assert.equal(
    (await call("register", { username: "NEWMEMBER", password: "other" }))
      .status,
    409,
  );
  const concurrent = await Promise.all(
    [1, 2].map(() =>
      call("register", { username: "ConcurrentMember", password: "valid" }),
    ),
  );
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]);
  for (const payload of [
    { username: "", password: "valid" },
    { username: "x".repeat(31), password: "valid" },
    { username: "Invalid", password: "   " },
    { username: "Invalid", password: "x".repeat(129) },
    { username: "Invalid", password: 123 },
  ])
    assert.equal((await call("register", payload)).status, 400);
  const crossSite = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: "https://wrong.example",
    },
    body: JSON.stringify({
      type: "register",
      payload: { username: "CrossSite", password: "valid" },
    }),
  });
  assert.equal(crossSite.status, 403);
  const logout = await call("logout", {}, registered.cookie);
  assert.match(logout.setCookie, /Max-Age=0/);
  assert.equal((await fetch(url)).status, 401);
});
after(async () => {
  child?.kill();
  await new Promise((r) => setTimeout(r, 300));
  if (folder) await rm(folder, { recursive: true, force: true });
});
test("API login, member permissions, simultaneous sell/claim and durable data", async () => {
  assert.equal((await call("listing.sell", { id: "fake" })).status, 401);
  assert.equal(
    (await call("login", { username: "MrAirWolf", password: "wrong" })).status,
    401,
  );
  const login = await call("login", {
    username: "MrAirWolf",
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
  assert.equal(memberView.characters.length, 1);
  assert.equal(memberView.characters[0].ownerId, member.id);
  const adminView = await fetch(url, { headers: { cookie: adminCookie } }).then(
    (r) => r.json(),
  );
  const otherCharacter = adminView.characters.find(
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
  assert.deepEqual(
    settlement.payouts.map((p) => p.amount),
    [400, 400],
  );
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

test("group consent and privacy hold through API responses and concurrent invitations", async () => {
  const a = await call("register", { username: "GroupA", password: "test" });
  const b = await call("register", { username: "GroupB", password: "test" });
  const c = await call("register", { username: "GroupC", password: "test" });
  await call("character.save", { name: "SecretA", hp: 1, attack: 2 }, a.cookie);
  const made = await call("group.create", { name: "API group" }, a.cookie);
  const groupId = made.data.groups[0].id;
  const attempts = await Promise.all(
    [1, 2].map(() =>
      call("group.invite", { groupId, username: "GroupB" }, a.cookie),
    ),
  );
  assert.deepEqual(attempts.map((r) => r.status).sort(), [200, 409]);
  const invited = await fetch(url, { headers: { cookie: b.cookie } }).then(
    (r) => r.json(),
  );
  assert.equal(invited.characters.length, 0);
  assert.equal(invited.invitations.length, 1);
  const accepted = await call(
    "group.respond",
    { id: invited.invitations[0].id, accept: true },
    b.cookie,
  );
  assert.equal(accepted.data.characters[0].name, "SecretA");
  assert.equal(
    (await fetch(url, { headers: { cookie: c.cookie } }).then((r) => r.json()))
      .characters.length,
    0,
  );
  await call("group.kick", { groupId, userId: b.data.me.id }, a.cookie);
  assert.equal(
    (await fetch(url, { headers: { cookie: b.cookie } }).then((r) => r.json()))
      .characters.length,
    0,
  );
});

test("account cleanup backs up full data, promotes existing successor and signs out removed administrator", async () => {
  const logged = await call("login", {
    username: "MrAirWolf",
    password: "test-password",
  });
  await call(
    "user.save",
    { ...logged.data.me, username: "Wolf" },
    logged.cookie,
  );
  const successor = await call("register", {
    username: "MrAirWolf",
    password: "successor-password",
  });
  assert.equal(successor.data.me.admin, false);
  assert.equal(
    (
      await call(
        "maintenance.cleanup",
        { confirm: "MrAirWolf" },
        successor.cookie,
      )
    ).status,
    403,
  );
  const cleaned = await call(
    "maintenance.cleanup",
    { confirm: "MrAirWolf" },
    logged.cookie,
  );
  assert.equal(cleaned.status, 200);
  assert.equal(cleaned.data, null);
  assert.match(cleaned.setCookie, /Max-Age=0/);
  const restored = await fetch(url, {
    headers: { cookie: successor.cookie },
  }).then((r) => r.json());
  assert.equal(restored.me.admin, true);
  assert.equal(
    restored.users.some((u) => u.username === "Wolf"),
    false,
  );
  assert.equal(
    (await fetch(url, { headers: { cookie: logged.cookie } })).status,
    401,
  );
  const backups = (await readdir(folder)).filter((name) =>
    name.startsWith("before-account-cleanup-"),
  );
  assert.equal(backups.length, 1);
  const backup = JSON.parse(await readFile(join(folder, backups[0]), "utf8"));
  assert.equal(
    backup.users.some((u) => u.username === "Wolf"),
    true,
  );
  assert.equal(
    backup.users.find((u) => u.username === "MrAirWolf").admin,
    false,
  );
});
