import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  activityAction,
  activityView,
  activityPeriods,
} from "../server/activities.js";
let folder;
const member = {
    id: "member-a",
    username: "Explorer",
    active: true,
    admin: false,
  },
  other = { id: "member-b", username: "Friend", active: true },
  admin = { id: "admin", username: "MrAirWolf", active: true, admin: true },
  users = [member, other, admin];
const now = Date.parse("2026-11-16T12:00:00+08:00");
before(async () => {
  folder = await mkdtemp(join(tmpdir(), "dnweb-activities-"));
  process.env.LOCAL_DATA_DIR = folder;
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = "";
});
after(async () => {
  await rm(folder, { recursive: true, force: true });
});
const view = (u = member, time = now) => activityView(u, users, time);
async function payload(id, u = member, time = now) {
  const v = await view(u, time),
    a = v.activities.find((x) => x.id === id);
  return {
    submissionId: crypto.randomUUID(),
    activityId: id,
    version: a.version,
    round: a.used,
    day: v.period.day,
    ...(a.content ? { contentId: a.content.id, choice: 0 } : {}),
  };
}
test("activity days and Monday weeks use Taiwan boundaries including year rollover", () => {
  assert.deepEqual(activityPeriods(Date.parse("2026-11-15T15:59:59Z")), {
    day: "2026-11-15",
    week: "2026-11-09",
  });
  assert.deepEqual(activityPeriods(Date.parse("2026-11-15T16:00:00Z")), {
    day: "2026-11-16",
    week: "2026-11-16",
  });
  assert.equal(
    activityPeriods(Date.parse("2027-01-01T00:00:00+08:00")).week,
    "2026-12-28",
  );
});
test("member view hides quiz answers, configuration and other members private data", async () => {
  const v = await view();
  assert.equal(v.activities.length, 3);
  assert.equal(v.adminConfig, null);
  const quiz = v.activities.find((a) => a.id === "quiz");
  assert.ok(quiz.content.question);
  assert.equal(quiz.content.correct, undefined);
  assert.equal(quiz.content.explanation, undefined);
  assert.equal(v.member.total, 0);
});
test("concurrent identical requests award points exactly once and retry returns original receipt", async () => {
  const p = await payload("fortune");
  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      activityAction(member, users, "activity.submit", p, now),
    ),
  );
  assert.ok(results.every((r) => r.id === results[0].id));
  const v = await view();
  assert.equal(v.member.total, 5);
  assert.equal(v.member.count, 1);
  assert.equal(v.weekly, 5);
  await assert.rejects(
    () =>
      activityAction(
        member,
        users,
        "activity.submit",
        { ...p, points: 99999 },
        now,
      ),
    { status: 409 },
  );
});
test("parallel different submission IDs cannot bypass daily limits; other member is independent", async () => {
  const p = await payload("event");
  const results = await Promise.allSettled(
    Array.from({ length: 5 }, () =>
      activityAction(
        member,
        users,
        "activity.submit",
        { ...p, submissionId: crypto.randomUUID() },
        now,
      ),
    ),
  );
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(
    results.filter((x) => x.status === "rejected" && x.reason.status === 409)
      .length,
    4,
  );
  const otherResult = await activityAction(
    other,
    users,
    "activity.submit",
    await payload("fortune", other),
    now,
  );
  assert.equal(otherResult.delta, 5);
  await assert.rejects(
    () => activityAction(member, users, "activity.history", {}, now),
    { status: 410 },
  );
  assert.equal((await view(member)).member.count, 2);
});
test("quiz is scored by server, returns explanation after submission, and rejects stale days", async () => {
  const p = await payload("quiz");
  const adminView = await view(admin);
  const correct = adminView.adminConfig.questions.find(
    (q) => q.id === p.contentId,
  ).correct;
  const r = await activityAction(
    member,
    users,
    "activity.submit",
    { ...p, choice: correct, points: 99999 },
    now,
  );
  assert.equal(r.delta, 7);
  assert.match(r.resultDetails, /正確答案/);
  const stale = await payload("fortune", other);
  await assert.rejects(
    () =>
      activityAction(other, users, "activity.submit", stale, now + 86400000),
    { status: 409 },
  );
});
test("next day and next week reset allowances and weekly scores, preserve total and history", async () => {
  let v = await view(member, now + 86400000);
  assert.ok(v.activities.every((a) => a.used === 0));
  assert.equal(v.member.total, 17);
  v = await view(member, now + 7 * 86400000);
  assert.equal(v.weekly, 0);
  assert.equal(v.member.total, 17);
  await activityAction(
    member,
    users,
    "activity.submit",
    await payload("fortune", member, now + 7 * 86400000),
    now + 7 * 86400000,
  );
  v = await view(member, now + 7 * 86400000);
  assert.equal(v.member.total, 22);
  assert.equal(v.weekly, 5);
});
test("nickname edits keep member identity, history, totals and current leaderboard", async () => {
  await activityAction(
    member,
    users,
    "activity.profile",
    { nickname: "冒險者小狼" },
    now,
  );
  const v = await view();
  assert.equal(v.member.nickname, "冒險者小狼");
  assert.equal(v.member.total, 22);
  assert.equal(
    v.leaderboard.find((x) => x.memberId === member.id).name,
    "冒險者小狼",
  );
});
test("admin correction is audited, idempotent, does not count as participation, and ordinary member denied", async () => {
  const p = {
    submissionId: crypto.randomUUID(),
    memberId: member.id,
    delta: -3,
    reason: "修正活動獎勵",
  };
  await assert.rejects(
    () => activityAction(member, users, "activity.adjust", p, now),
    { status: 403 },
  );
  const before = (await view()).member;
  const r = await activityAction(admin, users, "activity.adjust", p, now);
  await activityAction(admin, users, "activity.adjust", p, now);
  assert.equal(r.before, 22);
  assert.equal(r.after, 19);
  assert.equal(r.operatorId, admin.id);
  assert.equal(r.reason, p.reason);
  assert.equal((await view()).member.count, before.count);
  const report = await activityAction(
    admin,
    users,
    "activity.report",
    { from: "2026-11-01", to: "2026-11-30" },
    now,
  );
  assert.equal(report.rows.filter((r) => r.kind === "adjustment").length, 1);
  await assert.rejects(
    () =>
      activityAction(
        member,
        users,
        "activity.report",
        { from: "2026-11-01", to: "2026-11-30" },
        now,
      ),
    { status: 403 },
  );
});
test("configuration validates permissions, revisions and answers; disabling activity stops stale submissions", async () => {
  const c = (await view(admin)).adminConfig;
  await assert.rejects(
    () => activityAction(member, users, "activity.config", c, now),
    { status: 403 },
  );
  await assert.rejects(() =>
    activityAction(
      admin,
      users,
      "activity.config",
      { ...c, questions: [{ ...c.questions[0], correct: 99 }] },
      now,
    ),
  );
  const p = await payload("quiz", other);
  c.activities.find((a) => a.id === "quiz").enabled = false;
  await activityAction(admin, users, "activity.config", c, now);
  await assert.rejects(
    () => activityAction(admin, users, "activity.config", c, now),
    { status: 409 },
  );
  await assert.rejects(
    () => activityAction(other, users, "activity.submit", p, now),
    { status: 409 },
  );
  assert.equal((await view()).activities.length, 2);
});
test("invalid selection, dates and missing user cannot create ledger entries", async () => {
  await assert.rejects(async () =>
    activityAction(
      other,
      users,
      "activity.submit",
      { ...(await payload("event", other)), choice: 99 },
      now,
    ),
  );
  await assert.rejects(() =>
    activityAction(
      admin,
      users,
      "activity.report",
      { from: "2026-11-20", to: "2026-11-01" },
      now,
    ),
  );
  await assert.rejects(
    () =>
      activityAction(
        admin,
        users,
        "activity.adjust",
        {
          submissionId: crypto.randomUUID(),
          memberId: "missing",
          delta: 2,
          reason: "test",
        },
        now,
      ),
    { status: 404 },
  );
  const v = await view(other);
  assert.equal(v.member.total, 5);
});

test("scheduled event deducts its signed reward exactly once and rejects invalid probability totals", async () => {
  const c = (await view(admin)).adminConfig;
  const event = c.events[0];
  event.options[0].outcomes = [{ result: "扣血", chance: 99, stars: -1 }];
  c.schedule = { "2026-11-16": { event: event.id } };
  await assert.rejects(
    () => activityAction(admin, users, "activity.config", c, now),
    /100%/,
  );
  event.options[0].outcomes[0].chance = 100;
  await activityAction(admin, users, "activity.config", c, now);
  const p = await payload("event", other);
  assert.equal(p.contentId, event.id);
  const before = await view(other);
  const record = await activityAction(other, users, "activity.submit", p, now);
  assert.equal(record.delta, -1);
  assert.equal(record.summary, "扣血");
  assert.equal(
    (await activityAction(other, users, "activity.submit", p, now)).id,
    record.id,
  );
  const after = await view(other);
  assert.equal(after.member.total, before.member.total - 1);
  assert.equal(after.weekly, before.weekly - 1);
});

test("journey advances across days and retries, with a server-validated optional middle choice", async () => {
  const c = (await view(admin)).adminConfig;
  const chapters = c.events.filter((e) => e.id.startsWith("journey-"));
  assert.equal(chapters.length, 60);
  assert.equal(
    chapters.filter((e) => e.options.some((o) => o.revealChance === 30)).length,
    24,
  );
  const extra = chapters[1].options[2];
  extra.revealChance = 100;
  c.eventUnlimited = true;
  c.schedule = {};
  await activityAction(admin, users, "activity.config", c, now);
  const event = async (time) =>
    (await view(admin, time)).activities.find((a) => a.id === "event");
  const play = async (a, choice, time) =>
    activityAction(
      admin,
      users,
      "activity.submit",
      {
        activityId: a.id,
        version: a.version,
        day: a.day,
        round: a.used,
        contentId: a.content.id,
        submissionId: crypto.randomUUID(),
        choice,
      },
      time,
    );
  const first = await event(now);
  assert.equal(first.content.id, "journey-1");
  await play(first, 0, now);
  await assert.rejects(() => play(first, 0, now), { status: 409 });
  const second = await event(now);
  assert.equal(second.content.extraIndex, 1);
  assert.equal(second.content.options[1], extra.text);
  const record = await play(second, 1, now);
  assert.ok(
    extra.outcomes.some(
      (o) => o.result === record.summary && o.stars === record.delta,
    ),
  );
  const tomorrow = now + 86400000;
  const next = await event(tomorrow);
  assert.equal(next.content.id, "journey-3");
  assert.equal(next.used, 0);
  const settings = (await view(admin, tomorrow)).adminConfig;
  settings.eventUnlimited = false;
  const chapter = settings.events.find((e) => e.id === next.content.id);
  chapter.options.push({ ...extra, revealChance: 0 });
  await activityAction(admin, users, "activity.config", settings, tomorrow);
  const hidden = await event(tomorrow);
  assert.equal(hidden.content.options.length, 2);
  await assert.rejects(() => play(hidden, 2, tomorrow));
  await play(hidden, 1, tomorrow);
  assert.equal((await event(tomorrow)).content, undefined);
});
