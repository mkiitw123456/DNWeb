import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { transact } from "../server/store.js";
import { competitionRequest } from "../server/competition-store.js";

test("unlinked members can host and join; only the host scores and settles once with Discord names and exact shares", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ddstar-match-"));
  process.env.INITIAL_ADMIN_PASSWORD = "local-test-fixture";
  process.env.LOCAL_DATA_DIR = dir;
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = "";
  try {
    const users = ["Air", "一郎", "小泡芙"].map((name, i) => ({
      id: String(i),
      username: name,
      active: true,
      version: 1,
      ...(i === 1 ? { discordId: "123456789012345678" } : {}),
    }));
    await transact((s) => {
      s.users = users;
      s.discordWebhooks = { casino: "https://example.invalid/mock" };
    });
    const call = (i, type, p = {}) =>
      competitionRequest(users[i], "competition." + type, p);
    const draft = {
      title: "會內賽",
      description: "集合後開始",
      scheduledAt: "2026-11-20T20:00",
      submissionId: randomUUID(),
    };
    const { view } = await call(0, "create", draft),
      id = view.room.id;
    assert.equal((await call(0, "create", draft)).view.rooms.length, 1);
    assert.equal(view.room.scheduledAt, Date.parse("2026-11-20T12:00Z"));
    assert.equal(view.room.description, draft.description);
    assert.equal(view.rooms[0].description, undefined);
    for (let i = 0; i < 3; i++) await call(i, "join", { id });
    await call(2, "join", { id });
    await assert.rejects(
      call(2, "score", { id, memberId: "2", coins: 8, previous: 0 }),
      { status: 403 },
    );
    await assert.rejects(
      call(0, "settle", { id, version: 3, total: 101 }),
      /月亮幣/,
    );
    for (const [i, coins] of [100, 80, 60].entries())
      await call(0, "score", { id, memberId: String(i), coins, previous: 0 });
    await assert.rejects(call(0, "settle", { id, version: 3, total: 101 }), {
      status: 409,
    });
    await assert.rejects(call(1, "settle", { id, version: 6, total: 101 }), {
      status: 403,
    });
    const { view: final, jobs } = await call(0, "settle", {
      id,
      version: 6,
      total: 101,
    });
    assert.deepEqual(
      final.room.entries.map((e) => e.payout),
      [42, 34, 25],
    );
    assert.equal(final.rooms[0].count, 3);
    assert.match(jobs[0].message.content, /Air/);
    assert.match(jobs[0].message.content, /<@123456789012345678>/);
    assert.deepEqual(jobs[0].message.allowed_mentions.users, [
      "123456789012345678",
    ]);
    await assert.rejects(call(0, "settle", { id, version: 6, total: 101 }), {
      status: 409,
    });
    assert.equal((await call(2, "state", { id })).view.room.total, 101);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
import { competitionAction } from "../server/competitions.js";

test("admin opens the pool, spectators join independently and only the host assigns shares", () => {
  const users = ["host", "rival", "fan", "other", "admin"].map(id => ({id, username:id, active:true, admin:id==="admin"}));
  const state = {users, competitions:[], deliveries:[]};
  const run = (i, type, payload={}) => competitionAction(state, users[i], "competition."+type, {id:state.competitions[0]?.id,...payload});
  run(0,"create",{title:"鐵匠",description:"測試",scheduledAt:"2026-12-01T20:00",submissionId:randomUUID()});
  run(0,"join"); run(1,"join");
  assert.throws(()=>run(2,"openPool"),{status:403}); assert.throws(()=>run(2,"bet"));
  run(4,"openPool"); assert.throws(()=>run(2,"join"));
  run(2,"bet");run(2,"bet");
  assert.throws(()=>run(2,"enroll",{username:"other"}),{status:403});
  assert.throws(()=>run(0,"enroll",{username:"missing"}),/找不到/);
  run(0,"enroll",{username:"OTHER"});
  const room=state.competitions[0];
  assert.equal(room.entries.length,2);assert.equal(room.pool.bets.length,2);
  assert.throws(()=>run(2,"score",{memberId:"fan",coins:3,previous:0}),{status:403});
  run(0,"score",{memberId:"fan",coins:3,previous:0});
  run(0,"score",{memberId:"other",coins:2,previous:0});
  assert.throws(()=>run(4,"settle",{version:room.version,total:101}),{status:403});
  run(0,"settle",{version:room.version,total:101});
  assert.deepEqual(room.pool.bets.map(b=>b.payout),[61,40]);
  assert.equal(room.total,101);assert.match(state.deliveries[0].message.content,/fan/);
});
