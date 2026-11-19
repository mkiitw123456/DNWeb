import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
let child, folder, admin, member;
const url = "http://127.0.0.1:5184/api/app";
async function call(type, payload, cookie) {
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ type, payload }),
  });
  return {
    status: r.status,
    body: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
before(async () => {
  folder = await mkdtemp(join(tmpdir(), "dnweb-activity-api-"));
  child = spawn(process.execPath, ["server/dev.js"], {
    env: {
      ...process.env,
      PORT: "5184",
      LOCAL_DATA_DIR: folder,
      INITIAL_ADMIN_PASSWORD: "test-admin",
      SESSION_SECRET: "test-activity-session",
      FIREBASE_SERVICE_ACCOUNT_JSON: "",
      DISCORD_WEBHOOK_URL: "",
    },
    stdio: "pipe",
  });
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw Error("server did not start");
});
after(async () => {
  child?.kill();
  await new Promise((resolve) =>
    child.exitCode !== null ? resolve() : child.once("exit", resolve),
  );
  await rm(folder, { recursive: true, force: true });
});
test("activity endpoints require session, bootstrap contains activity without disclosing answers", async () => {
  assert.equal((await call("activity.state")).status, 401);
  admin = await call("login", {
    username: "MrAirWolf",
    password: "test-admin",
  });
  assert.equal(admin.status, 200);
  member = await call("register", {
    username: "ActivityMember",
    password: "test-password",
  });
  assert.equal(member.status, 200);
  assert.equal(member.body.activity.adminConfig, null);
  const r = await fetch(url + "?bootstrap=1", {
    headers: { cookie: member.cookie },
  });
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.equal(data.me.id, member.body.me.id);
  assert.equal(data.activity.activities.length, 3);
  assert.match(
    r.headers.get("set-cookie"),
    /HttpOnly; SameSite=Lax; Max-Age=34560000/,
  );
  assert.equal(
    data.activity.activities.find((a) => a.type === "quiz").content.correct,
    undefined,
  );
});
test("HTTP submissions ignore spoofed owner and points; concurrent requests remain atomic", async () => {
  const v = member.body.activity,
    a = v.activities.find((a) => a.id === "fortune");
  const payload = {
    submissionId: crypto.randomUUID(),
    activityId: a.id,
    day: a.day,
    version: a.version,
    memberId: admin.body.me.id,
    points: 100000,
  };
  const results = await Promise.all([
    call("activity.submit", payload, member.cookie),
    call("activity.submit", payload, member.cookie),
  ]);
  assert.ok(results.every((r) => r.status === 200));
  assert.equal(results[0].body.id, results[1].body.id);
  assert.equal(results[0].body.memberId, member.body.me.id);
  assert.equal(results[0].body.delta, 5);
  const persisted = JSON.parse(
    await readFile(join(folder, "state.json"), "utf8"),
  );
  assert.equal(
    persisted.deliveries.filter(
      (e) =>
        e.actorId === member.body.me.id &&
        e.message.content.includes("【參與活動】"),
    ).length,
    1,
    "The committed reward and its notification are only issued once",
  );
  const myHistory = await call(
    "activity.history",
    { memberId: admin.body.me.id },
    member.cookie,
  );
  assert.equal(myHistory.status, 410);
  assert.equal(
    (await call("activity.state", {}, member.cookie)).body.member.count,
    1,
  );
  assert.equal(
    (
      await call(
        "activity.adjust",
        { memberId: member.body.me.id, delta: 5, reason: "spoof" },
        member.cookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "activity.config",
        admin.body.activity.adminConfig,
        member.cookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "activity.report",
        { from: "2026-11-01", to: "2026-11-30" },
        member.cookie,
      )
    ).status,
    403,
  );
});
test("disabled accounts cannot use persistent cookie for activities", async () => {
  const u = member.body.me;
  const result = await call(
    "user.save",
    {
      id: u.id,
      username: u.username,
      password: "",
      discordId: "",
      active: false,
    },
    admin.cookie,
  );
  assert.equal(result.status, 200);
  assert.equal((await call("activity.state", {}, member.cookie)).status, 401);
  assert.equal((await call("activity.history", {}, member.cookie)).status, 401);
});
