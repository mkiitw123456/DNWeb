import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { activityAction, activityView } from "../server/activities.js";
import { activityTransaction } from "../server/activity-store.js";
let folder;
const admin = { id: "owner", username: "owner", active: true, admin: true },
  member = { id: "player", username: "player", active: true },
  users = [admin, member];
const now = Date.parse("2026-11-17T12:00:00+08:00");
before(async () => {
  folder = await mkdtemp(join(tmpdir(), "ddstar-quiz-"));
  process.env.LOCAL_DATA_DIR = folder;
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = "";
});
after(() => rm(folder, { recursive: true, force: true }));
test("fortune editing validates results and changes actual published introduction and draw", async () => {
  const v = await activityView(admin, users, now),
    c = structuredClone(v.adminConfig);
  c.fortuneIntro = "今日星光";
  c.fortuneBody = "抽出你的祝福";
  c.fortunes = ["唯一的結果"];
  delete c.questions[0].difficulty;
  await activityAction(admin, users, "activity.config", c, now);
  const state = await activityView(member, users, now),
    a = state.activities.find((x) => x.id === "fortune");
  assert.equal(a.content.intro, c.fortuneIntro);
  assert.equal(a.content.body, c.fortuneBody);
  assert.equal(state.adminConfig, null);
  const r = await activityAction(
    member,
    users,
    "activity.submit",
    {
      submissionId: crypto.randomUUID(),
      activityId: a.id,
      day: state.period.day,
      version: a.version,
    },
    now,
  );
  assert.equal(r.summary, "唯一的結果");
  const current = (await activityView(admin, users, now)).adminConfig;
  await assert.rejects(() =>
    activityAction(
      admin,
      users,
      "activity.config",
      { ...current, fortunes: [] },
      now,
    ),
  );
  await assert.rejects(
    () => activityAction(member, users, "activity.config", current, now),
    { status: 403 },
  );
  assert.equal(current.questions[0].difficulty, undefined);
});
test("quiz score is separate, server-scored, idempotent and not affected by other activities or general adjustments", async () => {
  const state = await activityView(member, users, now),
    a = state.activities.find((x) => x.id === "quiz");
  const c = (await activityView(admin, users, now)).adminConfig;
  const p = {
    submissionId: crypto.randomUUID(),
    activityId: a.id,
    day: state.period.day,
    version: a.version,
    contentId: a.content.id,
    choice: c.questions.find((q) => q.id === a.content.id).correct,
    quizPoints: 99999,
  };
  await Promise.all([
    activityAction(member, users, "activity.submit", p, now),
    activityAction(member, users, "activity.submit", p, now),
  ]);
  await activityAction(
    admin,
    users,
    "activity.adjust",
    {
      submissionId: crypto.randomUUID(),
      memberId: member.id,
      delta: 20,
      reason: "一般積分",
    },
    now,
  );
  const v = await activityView(member, users, now);
  assert.equal(v.member.quizStats.points, 7);
  assert.equal(v.member.quizStats.count, 1);
  assert.equal(v.member.quizStats.correct, 1);
  assert.equal(v.member.total, 32);
  await assert.rejects(
    () => activityAction(member, users, "activity.quizScores", {}, now),
    { status: 403 },
  );
  const report = await activityAction(
    admin,
    users,
    "activity.quizScores",
    {},
    now,
  );
  assert.equal(report.members.find((m) => m.memberId === member.id).points, 7);
  await activityTransaction(async (db) => {
    for (const [key] of db.entries())
      if (key.startsWith("records/ledger/")) db.delete(key);
  });
  assert.equal(
    (await activityView(member, users, now + 40 * 86400000)).member.quizStats
      .points,
    7,
  );
});
test("legacy retained quiz rows backfill once, excluding non-quiz rows", async () => {
  const old = { id: "legacy", username: "old", active: true };
  await activityTransaction(async (db) => {
    db.set("member_legacy", {
      memberId: "legacy",
      total: 100,
      count: 20,
      nickname: "",
    });
    db.set("records/ledger/oldquiz", {
      memberId: "legacy",
      activityId: "quiz",
      kind: "participation",
      delta: 7,
      summary: "答對了！",
    });
    db.set("records/ledger/oldfortune", {
      memberId: "legacy",
      activityId: "fortune",
      kind: "participation",
      delta: 5,
    });
  });
  const first = await activityView(old, [...users, old], now);
  assert.equal(first.member.quizStats.points, 7);
  assert.equal(first.member.quizStats.correct, 1);
  assert.equal(first.member.total, 100);
  const second = await activityView(old, [...users, old], now);
  assert.deepEqual(first.member.quizStats, second.member.quizStats);
});
