import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  activityAction,
  activityView,
  defaultActivityConfig,
  normalizeActivityConfig,
} from "../server/activities.js";
import {
  matchesContent,
  monthCells,
  shiftMonth,
} from "../src/activity-calendar.js";
import { diffActivityConfig, applyActivityPatch, rebaseActivityDraft } from "../shared/activity-config-patch.js";
const admin = { id: "a", username: "A", admin: true, active: true },
  user = { id: "u", username: "U", active: true },
  other = { id: "o", username: "O", active: true },
  users = [admin, user, other];
let folder;
const at = (s) => Date.parse(s + "+08:00"),
  now = at("2026-11-18T12:00:00");
before(async () => {
  folder = await mkdtemp(join(tmpdir(), "ddstar-calendar-"));
  process.env.LOCAL_DATA_DIR = folder;
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = "";
});
after(() => rm(folder, { recursive: true, force: true }));
const config = async () =>
  structuredClone((await activityView(admin, users, now)).adminConfig);
test("a small admin edit sends only changed rows, preserves newer typing and rejects stale or invalid patches", async () => {
  const initial = await config();
  const submitted = {
    ...initial,
    fortunes: initial.fortunes.map((f, i) => i === 0 ? { ...f, title: "  季節籤  " } : f),
  };
  const patch = diffActivityConfig(initial, submitted);
  assert.deepEqual(Object.keys(patch.changes), []);
  assert.deepEqual(patch.rows, { fortunes: [submitted.fortunes[0]] });
  assert.ok(JSON.stringify(patch).length * 10 < JSON.stringify(initial).length);
  const payload = { version: initial.version, patch };
  const receipt = await activityAction(admin, users, "activity.config", payload, now);
  const confirmed = { ...applyActivityPatch(initial, receipt.patch), version: receipt.version };
  assert.equal(confirmed.fortunes[0].title, "季節籤");
  assert.equal(confirmed.events, initial.events);
  assert.equal(confirmed.version, initial.version + 1);
  const laterDraft = { ...submitted, fortuneIntro: "下一個草稿" };
  const rebased = rebaseActivityDraft(laterDraft, submitted, confirmed);
  assert.equal(rebased.fortunes, confirmed.fortunes);
  assert.equal(rebased.fortuneIntro, "下一個草稿");
  assert.equal(rebaseActivityDraft(confirmed, confirmed, confirmed), confirmed);
  assert.deepEqual(await config(), confirmed);
  await assert.rejects(() => activityAction(admin, users, "activity.config", payload, now), { status: 409 });
  for (const badPatch of [
    { changes: { version: 234 }, rows: {} },
    { changes: {}, rows: { fortunes: [{ ...submitted.fortunes[0], id: "absent" }] } },
    { changes: {}, rows: { fortunes: [submitted.fortunes[0], submitted.fortunes[0]] } },
  ]) {
    await assert.rejects(() => activityAction(admin, users, "activity.config", {
      version: confirmed.version, patch: badPatch,
    }, now), { status: 400 });
  }
});
test("legacy fortunes retain every body and get stable editable titles and IDs", () => {
  const c = defaultActivityConfig();
  c.fortunes = ["舊籤文一", "舊籤文二"];
  const m = normalizeActivityConfig(c);
  assert.deepEqual(
    m.fortunes.map((x) => x.body),
    c.fortunes,
  );
  assert.equal(m.fortunes[0].title, "冒險籤 1");
  assert.deepEqual(normalizeActivityConfig(m), m);
});
test("substring search is case-insensitive and works for single characters, numerals and normalized fullwidth", () => {
  for (const q of ["T", "e", "s", "t", "1", "2", "3", "EST", "１２"])
    assert.ok(matchesContent("Test123", q));
  assert.equal(matchesContent("Test123", "nope"), false);
  assert.equal(monthCells("2028-02").filter(Boolean).length, 29);
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
});
test("all three scheduled items override random pools and fortune returns title plus body", async () => {
  const c = await config();
  c.fortunes[0].title = "Test123";
  c.fortunes[0].body = "指定籤文內文";
  c.quizCategories = [c.questions[1].category];
  c.schedule = {
    "2026-11-18": {
      fortune: c.fortunes[0].id,
      quiz: c.questions[0].id,
      event: c.events[0].id,
    },
    "2026-11-19": { quiz: c.questions[1].id },
  };
  await assert.rejects(
    () => activityAction(user, users, "activity.config", c, now),
    { status: 403 },
  );
  await activityAction(admin, users, "activity.config", c, now);
  for (const who of [user, other]) {
    const v = await activityView(who, users, now);
    assert.equal(v.adminConfig, null);
    const q = v.activities.find((a) => a.id === "quiz");
    assert.equal(q.content.id, c.questions[0].id);
    assert.equal(q.content.correct, undefined);
    assert.equal(q.content.explanation, undefined);
    assert.equal(
      v.activities.find((a) => a.id === "event").content.id,
      c.events[0].id,
    );
    const f = v.activities.find((a) => a.id === "fortune");
    const r = await activityAction(
      who,
      users,
      "activity.submit",
      {
        submissionId: crypto.randomUUID(),
        activityId: f.id,
        day: f.day,
        version: f.version,
      },
      now,
    );
    assert.equal(r.summary, "Test123");
    assert.equal(r.resultDetails, "指定籤文內文");
    assert.equal(r.contentId, c.fortunes[0].id);
  }
  const before = await activityView(user, users, at("2026-11-19T08:59:59")),
    after = await activityView(user, users, at("2026-11-19T09:00:00"));
  assert.equal(
    before.activities.find((a) => a.id === "quiz").content.id,
    c.questions[0].id,
  );
  assert.equal(
    after.activities.find((a) => a.id === "quiz").content.id,
    c.questions[1].id,
  );
});
test("reordering content preserves calendar identity; deleting referenced content and malformed calendars fail", async () => {
  const c = await config(),
    id = c.schedule["2026-11-18"].quiz;
  c.questions.reverse();
  c.fortunes.reverse();
  await activityAction(admin, users, "activity.config", c, now);
  assert.equal(
    (await activityView(user, users, now)).activities.find(
      (a) => a.id === "quiz",
    ).content.id,
    id,
  );
  const current = await config();
  await assert.rejects(
    () =>
      activityAction(
        admin,
        users,
        "activity.config",
        { ...current, questions: current.questions.filter((q) => q.id !== id) },
        now,
      ),
    /指定的內容已移除/,
  );
  for (const schedule of [
    { "2026-02-30": {} },
    { "2026-11-18": { quiz: "missing" } },
    { "2026-11-18": { notAnActivity: id } },
  ])
    await assert.rejects(() =>
      activityAction(
        admin,
        users,
        "activity.config",
        { ...current, schedule },
        now,
      ),
    );
  await assert.rejects(() =>
    activityAction(
      admin,
      users,
      "activity.config",
      { ...current, fortunes: [{ id: "bad", title: "", body: "body" }] },
      now,
    ),
  );
  const cleared = { ...current, schedule: {} };
  await activityAction(admin, users, "activity.config", cleared, now);
  assert.deepEqual((await config()).schedule, {});
  assert.equal(
    (await activityView(user, users, now)).activities.find(
      (a) => a.id === "quiz",
    ).content.category,
    current.quizCategories[0],
  );
  await assert.rejects(
    () => activityAction(admin, users, "activity.config", cleared, now),
    { status: 409 },
  );
});
