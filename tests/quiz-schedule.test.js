import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  activityView,
  activityAction,
  quizPeriods,
} from "../server/activities.js";
const admin = { id: "admin", username: "Admin", admin: true, active: true },
  member = { id: "member", username: "Member", active: true },
  users = [admin, member];
const at = (s) => Date.parse(s + "+08:00");
let folder;
before(async () => {
  folder = await mkdtemp(join(tmpdir(), "ddstar-schedule-"));
  process.env.LOCAL_DATA_DIR = folder;
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = "";
});
after(() => rm(folder, { recursive: true, force: true }));
test("Taiwan quiz day changes at 09:00 across month/year boundaries", () => {
  assert.equal(quizPeriods(at("2027-01-01T08:59:59")).day, "2026-12-31");
  assert.equal(quizPeriods(at("2027-01-01T09:00:00")).day, "2027-01-01");
});
test("admin selects allowed categories; members cannot choose outside the published pool", async () => {
  const now = at("2026-11-17T09:00:00"),
    c = (await activityView(admin, users, now)).adminConfig;
  c.questions = c.questions.map((q, i) => ({
    ...q,
    category: i < 2 ? "海龍" : "綠龍",
  }));
  c.quizCategories = ["海龍"];
  await activityAction(admin, users, "activity.config", c, now);
  for (const u of users) {
    const v = await activityView(u, users, now);
    assert.equal(
      v.activities.find((a) => a.id === "quiz").content.category,
      "海龍",
    );
  }
  const fresh = (await activityView(admin, users, now)).adminConfig;
  await assert.rejects(() =>
    activityAction(
      admin,
      users,
      "activity.config",
      { ...fresh, quizCategories: [] },
      now,
    ),
  );
  await assert.rejects(() =>
    activityAction(
      admin,
      users,
      "activity.config",
      { ...fresh, quizCategories: ["不存在"] },
      now,
    ),
  );
  await assert.rejects(
    () => activityAction(member, users, "activity.config", fresh, now),
    { status: 403 },
  );
});
test("09:00 resets quiz allowance, midnight does not; stale-day submission is rejected", async () => {
  const start = at("2026-11-17T09:00:00");
  const v = await activityView(member, users, start),
    a = v.activities.find((x) => x.id === "quiz");
  const p = {
    submissionId: crypto.randomUUID(),
    activityId: "quiz",
    version: a.version,
    day: a.day,
    contentId: a.content.id,
    choice: 0,
  };
  const reload = await activityView(member, users, start + 1000);
  assert.deepEqual(
    a.content,
    reload.activities.find((x) => x.id === "quiz").content,
  );
  await activityAction(member, users, "activity.submit", p, start);
  for (const when of ["2026-11-18T00:00:00", "2026-11-18T08:59:59"]) {
    const r = await activityView(member, users, at(when));
    assert.equal(r.activities.find((x) => x.id === "quiz").used, 1);
    assert.equal(r.activities.find((x) => x.id === "quiz").day, "2026-11-17");
    assert.equal(
      r.activities.find((x) => x.id === "fortune").day,
      "2026-11-18",
    );
  }
  await assert.rejects(
    () =>
      activityAction(
        member,
        users,
        "activity.submit",
        { ...p, submissionId: crypto.randomUUID() },
        at("2026-11-18T08:59:59"),
      ),
    { status: 409 },
  );
  const next = at("2026-11-18T09:00:00"),
    after = await activityView(member, users, next),
    q = after.activities.find((x) => x.id === "quiz");
  assert.equal(q.used, 0);
  assert.equal(q.day, "2026-11-18");
  await assert.rejects(
    () =>
      activityAction(
        member,
        users,
        "activity.submit",
        { ...p, submissionId: crypto.randomUUID() },
        next,
      ),
    { status: 409 },
  );
  await activityAction(
    member,
    users,
    "activity.submit",
    {
      ...p,
      submissionId: crypto.randomUUID(),
      day: q.day,
      contentId: q.content.id,
    },
    next,
  );
  assert.equal(
    (await activityView(member, users, next)).member.quizStats.count,
    2,
  );
});
