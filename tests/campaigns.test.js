import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { activityAction, activityView, defaultActivityConfig, normalizeActivityConfig } from "../server/activities.js";
import { journeyEvents } from "../server/journey.js";
import { validateCampaigns } from "../server/campaigns.js";

test("a campaign schedule rejects impossible dates, duplicate launches and unknown stories", () => {
  const events = [{ id: "journey-1" }];
  const entry = { startDay: "2026-11-20", scriptId: "journey" };
  for (const invalid of [
    [{ ...entry, startDay: "2026-02-30" }],
    [entry, entry],
    [{ ...entry, scriptId: "missing" }],
  ]) {
    assert.throws(() => validateCampaigns(invalid, events), { status: 400 });
  }
});

test("scheduled campaign unlocks at 09:00 and advances three chapters per member per day", async (t) => {
  const folder = await mkdtemp(join(tmpdir(), "ddstar-campaign-"));
  process.env.LOCAL_DATA_DIR = folder;
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = "";
  t.after(() => rm(folder, { recursive: true, force: true }));
  const admin = { id: "admin", active: true, admin: true };
  const member = { id: "member", active: true };
  const users = [admin, member];
  const start = Date.parse("2026-11-20T09:00:00+08:00");
  const tomorrow = start + 86400000;
  const viewEvent = async (now, who = member) =>
    (await activityView(who, users, now)).activities.find(
      (a) => a.type === "event",
    );
  const config = (await activityView(admin, users, start - 1)).adminConfig;
  const alternateScript = config.scripts.find((s) => s.id !== "journey");
  assert.ok(alternateScript);
  config.campaignSchedule = [
    { startDay: "2026-11-23", scriptId: alternateScript.id },
    { startDay: "2026-11-20", scriptId: "journey" },
  ];
  config.events = config.events.filter((e) => /^journey-[1-4]$/.test(e.id));
  const first = config.events.find((e) => e.id === "journey-1");
  first.options = [
    ...first.options.filter((o) => o.revealChance === undefined),
    {
      text: "測試機遇",
      revealChance: 100,
      outcomes: [{ chance: 100, result: "遇見星星", stars: 5 }],
    },
  ];
  config.schedule = { "2026-11-20": { event: "journey-4" } };
  await activityAction(admin, users, "activity.config", config, start - 1);
  assert.equal((await viewEvent(start - 1)).unlimited, true);
  let current = await viewEvent(start);
  assert.deepEqual(current.campaign, {
    title: "停鐘之旅",
    progress: 0,
    chapters: 4,
  });
  assert.equal(current.dailyLimit, 3);
  assert.equal(current.unlimited, false);
  assert.equal(current.content.id, "journey-1");
  const submit = (a, index, now = start) =>
    activityAction(
      member,
      users,
      "activity.submit",
      {
        activityId: a.id,
        day: a.day,
        version: a.version,
        round: a.used,
        contentId: a.content.id,
        choiceKey: a.content.choiceKeys[index],
        bonus: index === a.content.extraIndex,
        submissionId: crypto.randomUUID(),
      },
      now,
    );
  const bonus = await submit(current, current.content.extraIndex);
  assert.equal(bonus.bonus, true);
  await assert.rejects(() => submit(current, current.content.extraIndex), {
    status: 409,
  });
  current = await viewEvent(start);
  assert.equal(current.content.extraIndex, -1);
  assert.equal(current.used, 0);
  assert.equal(current.content.id, first.id);
  assert.equal((await viewEvent(tomorrow)).content.extraIndex, -1);
  for (let n = 0; n < 3; n++) {
    current = await viewEvent(start);
    assert.equal(current.campaign.progress, n);
    await submit(current, 0);
    await assert.rejects(() => submit(current, 0), { status: 409 });
  }
  assert.equal((await viewEvent(tomorrow - 1)).content, undefined);
  current = await viewEvent(tomorrow);
  assert.equal(current.used, 0);
  assert.equal(current.content.id, "journey-4");
  assert.equal((await viewEvent(tomorrow, admin)).content.id, first.id);
  await submit(current, 0, tomorrow);
  assert.equal((await viewEvent(tomorrow)).finished, true);
  const next = await viewEvent(start + 3 * 86400000);
  assert.equal(next.campaign.title, alternateScript.title);
  assert.equal(next.campaign.progress, 0);
  assert.ok(next.content.options.length >= 2);
});

test("published copy updates in place without rewriting guild choices, outcomes, odds or chapter progress", () => {
  const chapter = journeyEvents()[4];
  const custom = { text: "公會自訂行動", outcomes: [{ chance: 100, stars: 2, result: "公會自訂結果" }] };
  const saved = { ...chapter, options: [
    { ...chapter.options[2], text: "跳進回音的空拍", revealChance: 40,
      outcomes: [{ chance: 100, stars: 8, result: "你接住從暗層墜下的學徒筆記。" }] },
    custom,
  ] };
  const config = { ...defaultActivityConfig(), journeyEdition: 2, events: [saved] };
  const normalized = normalizeActivityConfig(config);
  assert.deepEqual(normalized.events[0].options, [
    { ...saved.options[0], text: chapter.options[2].text,
      outcomes: [{ chance: 100, stars: 8, result: chapter.options[2].outcomes[0].result }] }, custom
  ]);
  assert.deepEqual(normalizeActivityConfig(normalized), normalized);
  const guild = normalizeActivityConfig({ ...config, events: [{ ...saved, story: "公會自訂的委託" }] });
  assert.equal(guild.events[0].story, "公會自訂的委託");
});
