import { makeCopyUpdater } from "./story-copy.js";
import { randomInt, randomUUID, createHash } from "node:crypto";
import { journeyEvents } from "./journey.js";
import { currentCampaign, scriptCatalog, validateCampaigns } from "./campaigns.js";
import { fail, text, number } from "./domain.js";
import { activityTransaction, activityQuery } from "./activity-store.js";
import { aquariumKey, aquariumView, checkInAquarium } from "./aquarium.js";
import { diffActivityConfig, applyActivityPatch } from "../shared/activity-config-patch.js";
export function activityPeriods(now = Date.now()) {
  const shifted = new Date(now + 8 * 3600000);
  const day = shifted.toISOString().slice(0, 10);
  shifted.setUTCDate(shifted.getUTCDate() - ((shifted.getUTCDay() + 6) % 7));
  return { day, week: shifted.toISOString().slice(0, 10) };
}
export function dailyActivityPeriods(now = Date.now()) {
  return {
    ...activityPeriods(now),
    day: activityPeriods(now - 9 * 3600000).day,
  };
}
// Compatibility for callers that previously used the quiz-specific schedule.
export const quizPeriods = dailyActivityPeriods;
export const defaultActivityConfig = () => ({
  version: 1,
  discordUrl: "",
  activities: [
    {
      id: "fortune",
      title: "每日冒險抽籤",
      description: "抽一張今日冒險籤，為公會帶來一點好運。",
      type: "fortune",
      enabled: true,
      dailyLimit: 1,
      points: 5,
      bonus: 0,
      duration: "約 10 秒",
    },
    {
      id: "quiz",
      title: "龍谷快問快答",
      description: "一道小題目，一起累積冒險知識。",
      type: "quiz",
      enabled: true,
      dailyLimit: 1,
      points: 5,
      bonus: 2,
      duration: "約 1 分鐘",
    },
    {
      id: "event",
      title: "冒險隨機事件",
      description: "在旅途中做一個選擇，看看故事如何展開。",
      type: "event",
      enabled: true,
      dailyLimit: 1,
      points: 5,
      bonus: 0,
      duration: "約 30 秒",
    },
  ],
  fortuneIntro: "今天，會遇見什麼好事？",
  fortuneBody: "輕輕抽一張籤，帶著好心情出發。",
  fortunes: [
    {
      id: "f1",
      title: "分享帶來好運",
      body: "今日的幸運來自分享。到 Discord 分享一件讓你開心的小事吧！",
    },
    {
      id: "f2",
      title: "旅途中的寶藏",
      body: "旅途中最好的寶藏是夥伴。向一位公會成員打聲招呼吧！",
    },
    {
      id: "f3",
      title: "慢慢前進",
      body: "慢慢前進也算前進。今天給自己一點休息的時間。",
    },
  ],
  schedule: {},
  questions: [
    {
      id: "q1",
      question: "組隊挑戰副本前，哪個做法最能幫助團隊？",
      options: ["確認分工與準備物資", "不告知隊友就開打", "忽略隊友的提問"],
      correct: 0,
      explanation: "先確認分工與物資，可以讓不同經驗的隊友一起順利冒險。",
      category: "團隊合作",
    },
    {
      id: "q2",
      question: "看到新成員詢問副本機制時，你可以怎麼做？",
      options: ["要求他不要說話", "分享簡單說明並耐心回答", "只比較裝備數值"],
      correct: 1,
      explanation: "清楚且友善的說明，能幫助新成員融入團隊。",
      category: "公會知識",
    },
    {
      id: "q3",
      question: "本網站 Swordsman 圖示對應哪個中文職業？",
      options: ["劍聖", "祭司", "遊俠"],
      correct: 0,
      explanation:
        "Swordsman 對應劍聖。你可以在角色資訊中查看職業圖示與中文名稱。",
      category: "職業知識",
    },
    {
      id: "q4",
      question: "本網站角色的副本場次在台灣時間何時重置？",
      options: ["每週一 00:00", "每週六 09:00", "每天中午 12:00"],
      correct: 1,
      explanation:
        "角色副本場次於每週六 09:00 重置；活動積分則於週一 00:00 開始新的一週。",
      category: "公會工具",
    },
  ],
  events: [
    {
      id: "e1",
      title: "森林裡的求救聲",
      story: "天快黑了，林道旁有個新手捧著空水壺，問你回城該走哪條岔路。你也要回城，背包裡還有一張備用地圖和一袋乾糧。",
      options: [
        {
          text: "陪他走回城鎮",
          result: "你們一路聊著冒險故事，平安抵達城鎮。公會又多了一位朋友。",
        },
        {
          text: "分享地圖與補給",
          result:
            "你在地圖上圈出石橋，把乾糧分給他。傍晚經過城門時，他正坐在橋旁的茶攤朝你招手。",
        },
      ],
    },
    {
      id: "e2",
      title: "營火旁的晚餐",
      story: "隊伍淋了一天雨，到了營地，廚師還有半籃根菜沒切。幾個新成員圍著火發呆，領隊想找人陪他們聊聊，讓這頓飯熱鬧一點。",
      options: [
        {
          text: "幫忙準備料理",
          result: "大家一起分工，端出一桌熱騰騰的晚餐。今晚的營地充滿笑聲。",
        },
        {
          text: "分享旅途趣事",
          result: "你的故事讓疲憊的夥伴開懷大笑，明天又是值得期待的一天。",
        },
      ],
    },
  ],
});
const refreshStoryCopy = makeCopyUpdater([...journeyEvents(), ...defaultActivityConfig().events]);

function upgradedJourney(config) {
  const builtins = journeyEvents();
  const byId = new Map(builtins.map((e) => [e.id, e]));
  const savedIds = new Set(config.events.map((e) => e.id));
  const upgraded = config.events.map((event) => {
    const chapter = byId.get(event.id);
    if (!chapter) return event;
    const oldStars = event.id === "journey-1" ? 5 : 3;
    return {
      ...event,
      options: event.options.map((option) => {
        // Match the original shipped option, including its reward. Never restore removed choices.
        const replacement = chapter.options.find(
          (o) => o.revealChance === undefined && o.text === option.text,
        );
        const old = option.outcomes?.[0];
        return replacement &&
          option.revealChance === undefined &&
          option.outcomes?.length === 1 &&
          old.result === replacement.outcomes[0].result &&
          old.chance === 100 &&
          old.stars === oldStars
          ? { ...option, outcomes: replacement.outcomes }
          : option;
      }),
    };
  });
  return config.journeyInstalled
    ? upgraded
    : [...upgraded, ...builtins.filter((e) => !savedIds.has(e.id))];
}

export function normalizeActivityConfig(config) {
  const updated = config.journeyEdition === 3;
  const hasWeightedChoices = updated || config.journeyEdition === 2;
  if (!updated) config = { ...config, events: config.events.map(refreshStoryCopy) };
  return {
    ...config,
    // Refresh old open rounds before resolving a choice with revised wording.
    version: updated ? config.version : config.version + 1,
    journeyEdition: 3,
    schedule: config.schedule || {},
    campaignSchedule: config.campaignSchedule || [],
    journeyInstalled: true,
    eventUnlimited: false,
    events: (hasWeightedChoices ? config.events : upgradedJourney(config)).map(
      (event) => ({
        ...event,
        options: event.options.map((option) =>
          option.outcomes
            ? option
            : {
                text: option.text,
                outcomes: [
                  {
                    result: option.result,
                    chance: 100,
                    stars: config.activities.find((a) => a.type === "event")
                      .points,
                  },
                ],
              },
        ),
      }),
    ),
    fortunes: config.fortunes.map((f, i) =>
      typeof f === "string"
        ? { id: `legacy-f${i}`, title: `冒險籤 ${i + 1}`, body: f }
        : f,
    ),
  };
}
function contentId(id) {
  if (id === undefined) return randomUUID();
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(id))
    fail("內容識別碼格式錯誤");
  return id;
}
function uniqueIds(list) {
  if (new Set(list.map((x) => x.id)).size !== list.length)
    fail("內容識別碼重複，請重新載入");
  return list;
}
function validateSchedule(schedule, pools) {
  if (
    !schedule ||
    typeof schedule !== "object" ||
    Array.isArray(schedule) ||
    Object.keys(schedule).length > 730
  )
    fail("日曆最多可安排 730 個日期");
  const out = {};
  for (const [day, entry] of Object.entries(schedule)) {
    const date = Date.parse(`${day}T12:00:00+08:00`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      !Number.isFinite(date) ||
      activityPeriods(date).day !== day
    )
      fail("日曆日期無效");
    if (
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      Object.keys(entry).some((k) => !Object.hasOwn(pools, k))
    )
      fail("日曆活動設定無效");
    const selected = {};
    for (const [kind, id] of Object.entries(entry)) {
      if (id === "" || id === null) continue;
      if (!pools[kind].some((x) => x.id === id))
        fail(`${day} 指定的內容已移除，請先取消或更換日曆安排`);
      selected[kind] = id;
    }
    if (Object.keys(selected).length) out[day] = selected;
  }
  return out;
}
const keyOf = (...parts) =>
  createHash("sha256").update(JSON.stringify(parts)).digest("hex");
const defaultMember = (id) => ({
  memberId: id,
  nickname: "",
  total: 0,
  count: 0,
  lastAt: null,
});
async function ensureQuizStats(db, member, now) {
  if (member.quizStats) return member;
  const records = await db.quizRecords(member.memberId);
  member.quizStats = {
    points: records.reduce((n, r) => n + r.delta, 0),
    count: records.length,
    correct: records.filter(
      (r) => r.quizCorrect === true || r.summary === "答對了！",
    ).length,
    trackingSince: now,
    recoveredHistory: records.length > 0,
  };
  db.set(`member_${member.memberId}`, member);
  return member;
}
function scheduledItem(config, activity, day, used) {
  if (activity.type === "event" && config.eventUnlimited && used > 0)
    return null;
  return config.schedule?.[day]?.[activity.id];
}
function eventChoices(item, memberId, day, used) {
  const base = item.options.filter((o) => o.revealChance === undefined);
  const extra = item.options.find((o) => o.revealChance !== undefined);
  const roll =
    parseInt(keyOf(memberId, item.id, day, used).slice(0, 12), 16) / 2 ** 48;
  if (extra && roll * 100 < extra.revealChance) base.splice(1, 0, extra);
  return base;
}
function selectContent(config, activity, memberId, day, used, progress = 0) {
  const pool =
    activity.type === "quiz"
      ? config.questions
      : activity.type === "fortune"
        ? config.fortunes
        : config.events;
  const assigned = scheduledItem(config, activity, day, used);
  if (assigned) {
    const selected = pool.find((x) => x.id === assigned);
    if (!selected) fail("當日安排已失效，請管理員重新設定", 409);
    return selected;
  }
  if (activity.type === "event") {
    const chapters = pool
      .filter((e) => /^journey-\d+$/.test(e.id))
      .sort((a, b) => Number(a.id.slice(8)) - Number(b.id.slice(8)));
    if (chapters.length) return chapters[progress % chapters.length];
  }
  const list =
    activity.type === "quiz"
      ? pool.filter(
          (q) =>
            !config.quizCategories ||
            config.quizCategories.includes(q.category),
        )
      : pool;
  if (activity.type === "fortune") return list[randomInt(list.length)];
  if (!list.length) fail("目前沒有開放的快問快答題目，請聯絡管理員", 409);
  return list[
    parseInt(
      keyOf(memberId, activity.id, day, used, config.version).slice(0, 8),
      16,
    ) % list.length
  ];
}
function roundRules(config, a, day, today, member) {
  const campaign = a.type === "event" && currentCampaign(config, day, member);
  const counter = campaign ? "campaign" : a.id;
  const used = today?.counts?.[counter] || 0;
  return {
    campaign,
    counter,
    used,
    bonusUsed: campaign
      ? member.campaignBonuses?.[campaign.key] === campaign.progress
      : today?.bonusRounds?.[a.id] === used,
    unlimited: !campaign && a.type === "event" && config.eventUnlimited,
    dailyLimit: campaign ? 3 : a.dailyLimit,
  };
}
// Keep authored result text and use the same odds for previews and settlement.
export function chapterOutcomes(option, contentId, campaign) {
  const chapter = campaign ? campaign.progress + 1 : Number(/^journey-(\d+)$/.exec(contentId)?.[1]);
  const outcomes = option.outcomes;
  if (!(chapter >= 15)) return outcomes;
  const ranked = [...outcomes].sort((a, b) => b.stars - a.stars);
  const [win, ...losses] = ranked;
  if (!losses.length) losses.push({ result: "這次行動沒有成功，你得花費星星重新整備。", chance: 1, stars: -1 });
  const start = Math.min(60, win.chance);
  const progress = Math.min(1, (chapter - 15) / Math.max(1, (campaign?.length || 60) - 15));
  const chance = Math.round(start + (Math.min(start, 10) - start) * progress);
  const weight = losses.reduce((sum, o) => sum + o.chance, 0);
  let cumulative = 0, assigned = 0;
  return [{ ...win, chance, stars: Math.max(1, win.stars) }, ...losses.map(o => {
    cumulative += o.chance;
    const target = Math.round((100 - chance) * cumulative / weight);
    const share = target - assigned;
    assigned = target;
    return { ...o, chance: share, stars: -Math.max(1 + Math.floor(progress * 2), -o.stars) };
  })];
}
function visibleActivity(config, a, memberId, period, today, member, isAdmin) {
  const { used, dailyLimit, unlimited, bonusUsed, campaign } =
    roundRules(config, a, period.day, today, member);
  const result = {
    ...a,
    used,
    dailyLimit,
    unlimited,
    version: config.version,
    day: period.day,
    resetHour: 9,
  };
  if (campaign) {
    result.campaign = {
      title: campaign.title, progress: campaign.progress, chapters: campaign.length,
    };
    result.finished = !campaign.chapter;
  }
  if (a.type === "fortune")
    result.content = {
      intro: config.fortuneIntro || defaultActivityConfig().fortuneIntro,
      body: config.fortuneBody || defaultActivityConfig().fortuneBody,
    };
  if (a.type !== "fortune" && !result.finished && (unlimited || used < dailyLimit)) {
    const item = campaign?.chapter ||
      selectContent(config, a, memberId, period.day, used, member.journeyProgress || 0);
    const choices =
      a.type === "event"
        ? eventChoices(item, memberId, campaign?.key || period.day, campaign?.progress ?? used)
            .filter((o) => o.revealChance === undefined || !bonusUsed)
        : [];
    result.content =
      a.type === "quiz"
        ? {
            id: item.id,
            question: item.question,
            options: item.options,
            category: item.category,
          }
        : {
            id: item.id,
            title: item.title,
            story: item.story,
            options: choices.map((x) => x.text),
            choiceKeys: choices.map((x) => item.options.indexOf(x)),
            extraIndex: choices.findIndex((x) => x.revealChance !== undefined),
            odds: isAdmin ? choices.map((x) =>
              chapterOutcomes(x, item.id, campaign).map(({ chance, stars }) => ({ chance, stars })),
            ) : undefined,
          };
  }
  return result;
}
function rankedRows(board, users) {
  const active = new Set(users.filter(user => user.active).map(user => user.id));
  return Object.values(board?.members || {})
    .filter(row => active.has(row.memberId))
    .sort((a, b) => b.points - a.points || b.count - a.count || a.memberId.localeCompare(b.memberId));
}
function rankedLeaderboard(rows, users) {
  const names = new Map(users.map(user => [user.id, user]));
  return rows.slice(0, 50).map((row, i) => {
    const user = names.get(row.memberId);
    return { ...row, rank: i + 1, name: user?.nickname || row.nickname || user?.username || "冒險者" };
  });
}

let cachedSummary;
async function lobbySummary(users, now) {
  const period = activityPeriods(now);
  const { day } = dailyActivityPeriods(now);
  const key = period.week + "/" + day;
  if (!cachedSummary || cachedSummary.key !== key || now >= cachedSummary.until) {
    const pending = activityTransaction(async db => Promise.all([
      db.get(`week_${period.week}`), db.get(aquariumKey(day)),
    ]));
    const entry = { key, until: now + 60000, pending };
    cachedSummary = entry;
    console.info("db_usage lobby_summary cache_fill docs=2");
    pending.catch(() => { if (cachedSummary === entry) cachedSummary = null; });
  }
  const [board, aquarium] = await cachedSummary.pending;
  return { period, day, totalCheckIns: aquarium?.totalCheckIns || 0,
    species: aquarium?.species ?? [],
    leaderboard: rankedLeaderboard(rankedRows(board, users), users) };
}
export async function activityView(user, users, now = Date.now()) {
  const period = activityPeriods(now);
  const daily = dailyActivityPeriods(now);
  return activityTransaction(
    async (db) => {
      const [storedConfig, storedMember, today, board, aquarium] = await Promise.all([
        db.get("config"),
        db.get(`member_${user.id}`),
        db.get(`day_${keyOf(user.id, daily.day)}`),
        db.get(`week_${period.week}`),
        db.get(aquariumKey(daily.day)),
      ]);
      const config = normalizeActivityConfig(
        storedConfig || defaultActivityConfig(),
      );
      const member = await ensureQuizStats(
        db,
        storedMember || defaultMember(user.id),
        now,
      );
      const rows = rankedRows(board, users);
      const own = rows.find((x) => x.memberId === user.id);
      return {
        period,
        timezone: "Asia/Taipei",
        aquarium: aquariumView(daily.day, aquarium, today, member),
        member,
        weekly: own?.points || 0,
        weeklyCount: own?.count || 0,
        activities: config.activities
          .filter((x) => x.enabled)
          .map((a) =>
            visibleActivity(
              config,
              a,
              user.id,
              daily,
              today,
              member,
              user.admin,
            ),
          ),
        discordUrl: config.discordUrl,
        leaderboard: rankedLeaderboard(rows, users),
        adminConfig: user.admin ? { ...config, scripts: scriptCatalog(config.events) } : null,
      };
    },
    { authenticatedUser: user },
  );
}
function validateEvents(events) {
  if (!Array.isArray(events) || !events.length || events.length > 160)
    fail("冒險事件題庫需要 1–160 題");
  return uniqueIds(
    events.map((event) => {
      if (
        !Array.isArray(event?.options) ||
        event.options.length < 2 ||
        event.options.length > 6
      )
        fail("每題需要 2–6 個選項");
      const extras = event.options.filter((o) => o?.revealChance !== undefined);
      if (extras.length > 1 || event.options.length - extras.length < 2)
        fail("每題至少需要兩個一般選項，最多一個機遇選項");
      return {
        id: contentId(event.id),
        title: text(event.title, "事件標題", 120),
        story: text(event.story, "事件內文", 500),
        options: event.options.map((option) => {
          if (
            !Array.isArray(option?.outcomes) ||
            !option.outcomes.length ||
            option.outcomes.length > 8
          )
            fail("每個選項需要 1–8 種結果");
          const outcomes = option.outcomes.map((o) => {
            if (!Number.isSafeInteger(o?.stars) || Math.abs(o.stars) > 100)
              fail("結果星數須為 -100 至 100 的整數");
            const chance = number(o.chance, "機率", 100);
            if (!chance) fail("結果機率至少為 1%");
            return {
              result: text(o.result, "結果文字", 300),
              chance,
              stars: o.stars,
            };
          });
          if (outcomes.reduce((sum, o) => sum + o.chance, 0) !== 100)
            fail(`「${option.text}」的結果機率合計必須為 100%`);
          return {
            text: text(option.text, "選項名稱", 120),
            outcomes,
            ...(option.revealChance === undefined
              ? {}
              : { revealChance: number(option.revealChance, "出現機率", 100) }),
          };
        }),
      };
    }),
  );
}

function validateConfig(input, previous) {
  if (!Array.isArray(input.activities)) fail("活動設定不完整");
  const activities = previous.activities.map((old) => {
    const a = input.activities.find((a) => a && a.id === old.id);
    if (!a || typeof a.enabled !== "boolean") fail("活動設定不完整");
    return {
      ...old,
      title: text(a.title, "活動名稱", 60),
      description: text(a.description, "活動說明", 200),
      enabled: a.enabled,
      dailyLimit: number(a.dailyLimit, "每日次數", 10),
      points: number(a.points, "參與積分", 100),
      bonus: old.type === "quiz" ? number(a.bonus, "答對加分", 100) : 0,
    };
  });
  if (
    !Array.isArray(input.questions) ||
    !input.questions.length ||
    input.questions.length > 100
  )
    fail("題庫需要 1–100 題");
  const questions = input.questions.map((q, i) => {
    if (
      !q ||
      !Array.isArray(q.options) ||
      q.options.length < 2 ||
      q.options.length > 6
    )
      fail("題目需要 2–6 個選項");
    return {
      id: contentId(q.id),
      question: text(q.question, "題目", 300),
      options: q.options.map((x) => text(x, "選項", 120)),
      correct: number(q.correct, "正確選項", q.options.length - 1),
      explanation: text(q.explanation, "答案解析", 500),
      category: text(q.category, "分類", 40),
    };
  });
  uniqueIds(questions);
  const availableCategories = [...new Set(questions.map((q) => q.category))];
  const selectedCategories =
    input.quizCategories ?? previous.quizCategories ?? availableCategories;
  if (
    !Array.isArray(selectedCategories) ||
    !selectedCategories.length ||
    selectedCategories.some((c) => !availableCategories.includes(c))
  )
    fail("請至少選擇一個有題目的開放分類；刪除或更名分類後請重新選擇");
  const quizCategories = [...new Set(selectedCategories)];
  const discordUrl =
    typeof input.discordUrl === "string" ? input.discordUrl.trim() : "";
  if (
    discordUrl &&
    !/^https:\/\/(discord\.gg\/[\w-]+|discord\.com\/(channels\/[\d/]+|invite\/[\w-]+))$/.test(
      discordUrl,
    )
  )
    fail("請填寫有效的 Discord 邀請或頻道連結");
  const rawFortunes = input.fortunes ?? previous.fortunes;
  if (
    !Array.isArray(rawFortunes) ||
    rawFortunes.length < 1 ||
    rawFortunes.length > 100
  )
    fail("籤文需要 1–100 則");
  const fortunes = uniqueIds(
    rawFortunes.map((f, i) => {
      if (typeof f === "string") f = { title: `冒險籤 ${i + 1}`, body: f };
      if (!f || typeof f !== "object") fail("請填寫籤文標題與內文");
      return {
        id: contentId(f.id),
        title: text(f.title, "籤文標題", 120),
        body: text(f.body, "籤文內文", 500),
      };
    }),
  );
  if (
    input.eventUnlimited !== undefined &&
    typeof input.eventUnlimited !== "boolean"
  )
    fail("測試模式設定無效");
  const events = validateEvents(input.events ?? previous.events);
  const schedule = validateSchedule(input.schedule ?? previous.schedule ?? {}, {
    fortune: fortunes,
    quiz: questions,
    event: events,
  });
  return {
    ...previous,
    campaignSchedule: validateCampaigns(input.campaignSchedule ?? previous.campaignSchedule ?? [], events),
    quizCategories,
    eventUnlimited: false,
    events,
    fortunes,
    schedule,
    fortuneIntro: text(
      input.fortuneIntro ??
        previous.fortuneIntro ??
        defaultActivityConfig().fortuneIntro,
      "抽籤標題",
      120,
    ),
    fortuneBody: text(
      input.fortuneBody ??
        previous.fortuneBody ??
        defaultActivityConfig().fortuneBody,
      "抽籤內文",
      500,
    ),
    activities,
    questions,
    discordUrl,
    version: previous.version + 1,
  };
}
export async function activityAction(
  user, users, type, p, now = Date.now(), queueAudit,
) {
  if (
    [
      "activity.config",
      "activity.adjust",
      "activity.report",
      "activity.quizScores",
    ].includes(type) &&
    !user.admin
  )
    fail("僅管理員可操作", 403);
  if (type === "activity.quizScores") {
    return activityTransaction(
      async (db) => ({
        members: await Promise.all(
          users.map(async (u) => {
            const m = await ensureQuizStats(
              db,
              (await db.get(`member_${u.id}`)) || defaultMember(u.id),
              now,
            );
            return {
              memberId: u.id,
              username: u.username,
              nickname: u.nickname || m.nickname,
              active: u.active,
              ...m.quizStats,
            };
          }),
        ),
      }),
      { authenticatedUser: user },
    );
  }
  if (type === "activity.summary") return lobbySummary(users, now);
  if (type === "activity.state") return activityView(user, users, now);
  if (type === "aquarium.checkIn") {
    const { day } = dailyActivityPeriods(now);
    if (p.day !== day) fail("簽到日期已更新，請重新載入大廳", 409);
    return checkInAquarium(user, day, `day_${keyOf(user.id, day)}`, now, defaultMember(user.id));
  }
  if (type === "activity.history") fail("個人明細已停用，請查看積分摘要", 410);
  if (type === "activity.report") {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(p.from || "") ||
      !/^\d{4}-\d{2}-\d{2}$/.test(p.to || "")
    )
      fail("請選擇日期範圍");
    const from = Date.parse(`${p.from}T00:00:00+08:00`),
      before = Date.parse(`${p.to}T00:00:00+08:00`) + 86400000;
    if (
      !Number.isFinite(from) ||
      !Number.isFinite(before) ||
      activityPeriods(from).day !== p.from ||
      activityPeriods(before - 86400000).day !== p.to ||
      before <= from ||
      before - from > 35 * 86400000
    )
      fail("日期範圍須介於 1–35 天");
    const rows = await activityQuery("ledger", { from, before, limit: 5001 });
    if (rows.length > 5000) fail("紀錄超過 5,000 筆，請縮小日期範圍");
    const members = await activityTransaction(
      async (db) => Promise.all(
        users.map(async (u) => ({
          ...((await db.get(`member_${u.id}`)) || defaultMember(u.id)),
          username: u.username,
          active: u.active,
        })),
      ),
      { authenticatedUser: user },
    );
    return { rows, members };
  }
  return activityTransaction(
    async (db) => {
      const config = normalizeActivityConfig(
        (await db.get("config")) || defaultActivityConfig(),
      );
      if (type === "activity.config") {
        if (p.version !== config.version)
          fail("設定已更新，請重新載入後再修改", 409);
        let input = p;
        if (Object.hasOwn(p, "patch")) {
          try {
            input = applyActivityPatch(config, p.patch);
          } catch (error) {
            fail(error.message);
          }
        }
        const next = validateConfig(input, config);
        db.set("config", next);
        db.set(`config/versions/v${next.version}`, {
          ...next,
          operatorId: user.id,
          createdAt: now,
        });
        if (config.version === 1) db.set("config/versions/v1", config);
        if (!Object.hasOwn(p, "patch")) return { ok: true };
        return {
          ok: true,
          version: next.version,
          patch: diffActivityConfig(config, next),
          ...(input.events !== config.events ? { scripts: scriptCatalog(next.events) } : {}),
        };
      }
      const period =
        type === "activity.submit"
          ? dailyActivityPeriods(now)
          : activityPeriods(now);
      if (type === "activity.profile") {
        const member =
          (await db.get(`member_${user.id}`)) || defaultMember(user.id);
        const nickname = text(p.nickname, "遊戲暱稱", 30);
        const board = (await db.get(`week_${period.week}`)) || { members: {} };
        db.set(`member_${user.id}`, { ...member, nickname });
        if (board.members[user.id]) {
          board.members[user.id].nickname = nickname;
          db.set(`week_${period.week}`, board);
        }
        return { ok: true };
      }
      if (!["activity.submit", "activity.adjust"].includes(type))
        fail("未知的活動操作", 404);
      const submissionId = text(p.submissionId, "提交識別碼", 80);
      if (!/^[a-zA-Z0-9-]{8,80}$/.test(submissionId))
        fail("提交識別碼格式錯誤");
      const receiptKey = `receipt_${keyOf(user.id, submissionId)}`;
      const existing = await db.get(receiptKey);
      const fingerprint = keyOf(type, p);
      if (existing) {
        if (existing.fingerprint !== fingerprint)
          fail("同一提交識別碼不可用於不同操作", 409);
        return existing.result;
      }
      const memberId = type === "activity.adjust" ? p.memberId : user.id;
      if (!users.some((u) => u.id === memberId && u.active))
        fail("找不到使用中的成員", 404);
      const [savedMember, savedDay, savedBoard] = await Promise.all([
        db.get(`member_${memberId}`),
        db.get(`day_${keyOf(memberId, period.day)}`),
        db.get(`week_${period.week}`),
      ]);
      const member = await ensureQuizStats(
          db,
          savedMember || defaultMember(memberId),
          now,
        ),
        day = savedDay || { counts: {} },
        board = savedBoard || { members: {} };
      let quizCorrect = null,
        outcomeTier = null,
        bonus = false;
      let delta,
        summary,
        activityId = null,
        title = "管理員積分調整",
        resultDetails = "",
        reason = "",
        contentId = null;
      if (type === "activity.adjust") {
        if (
          !Number.isSafeInteger(p.delta) ||
          p.delta === 0 ||
          Math.abs(p.delta) > 10000
        )
          fail("調整積分須為 -10000 至 10000 的非零整數");
        reason = text(p.reason, "調整原因", 300);
        delta = p.delta;
        summary = reason;
      } else {
        const a = config.activities.find(
          (a) => a.id === p.activityId && a.enabled,
        );
        if (!a) fail("活動已關閉", 409);
        if (p.version !== config.version || p.day !== period.day)
          fail("活動內容或日期已更新，請重新開啟活動", 409);
        const { used, dailyLimit, unlimited, counter, bonusUsed, campaign } =
          roundRules(config, a, period.day, day, member);
        if (campaign && !campaign.chapter) fail("你已完成本期劇本", 409);
        if (
          (campaign || unlimited || p.round !== undefined || p.choiceKey !== undefined) &&
          p.round !== used
        )
          fail("這回合已結算，請重新開啟活動", 409);
        if (!unlimited && used >= dailyLimit)
          fail("今日已達參與上限，明天再來吧", 409);
        activityId = a.id;
        if (p.bonus === true && a.type !== "event")
          fail("此活動沒有機遇關卡", 409);
        title = a.title;
        delta = a.points;
        if (a.type === "fortune") {
          const fortune = selectContent(config, a, user.id, period.day, used);
          summary = fortune.title;
          resultDetails = fortune.body;
          contentId = fortune.id;
        } else {
          const content = campaign?.chapter || selectContent(
            config,
            a,
            user.id,
            period.day,
            used,
            member.journeyProgress || 0,
          );
          contentId = content.id;
          if (p.contentId !== content.id)
            fail("題目已更新，請重新開啟活動", 409);
          const choices =
            a.type === "event"
              ? eventChoices(content, user.id, campaign?.key || period.day, campaign?.progress ?? used)
              : content.options;
          if (a.type === "quiz") {
            const choice = number(p.choice, "選項", choices.length - 1);
            const correct = choice === content.correct;
            quizCorrect = correct;
            delta += correct ? a.bonus : 0;
            summary = correct ? "答對了！" : "謝謝參與，下次再試試！";
            resultDetails = `${content.question}\n正確答案：${content.options[content.correct]}\n${content.explanation}`;
          } else {
            // Stable option keys let an open tab keep the same ordinary choice
            // when another tab consumes the bonus and the visible indexes shift.
            const option =
              p.choiceKey === undefined
                ? choices[number(p.choice, "選項", choices.length - 1)]
                : content.options[
                    number(p.choiceKey, "選項", content.options.length - 1)
                  ];
            if (!choices.includes(option)) fail("此回合未出現這個選項", 409);
            bonus = option.revealChance !== undefined;
            if (p.bonus !== undefined && p.bonus !== bonus)
              fail("選項已更新，請重新開啟活動", 409);
            if (bonus) {
              if (p.round !== used || bonusUsed)
                fail("這次機遇已結算或過期，請繼續主線冒險", 409);
              if (campaign) {
                member.campaignBonuses = { ...member.campaignBonuses, [campaign.key]: campaign.progress };
              } else {
                day.bonusRounds = { ...day.bonusRounds, [a.id]: used };
              }
              title = `${a.title} · 意外的機遇`;
            } else if (campaign) {
              member.campaignProgress = { ...member.campaignProgress, [campaign.key]: campaign.progress + 1 };
            } else if (!scheduledItem(config, a, period.day, used)) {
              member.journeyProgress = (member.journeyProgress || 0) + 1;
            }
            const roll = randomInt(100);
            let limit = 0;
            const outcomes = chapterOutcomes(option, content.id, campaign);
            const outcome = outcomes.find((o) => {
              limit += o.chance;
              return roll < limit;
            });
            summary = outcome.result;
            delta = outcome.stars;
            const rewards = outcomes.map((o) => o.stars);
            const min = Math.min(...rewards),
              max = Math.max(...rewards);
            outcomeTier =
              min === max
                ? "neutral"
                : delta === min
                  ? "low"
                  : delta === max
                    ? "high"
                    : "neutral";
            resultDetails = content.title;
          }
        }
        if (!bonus) day.counts[counter] = used + 1;
      }
      if (quizCorrect !== null) {
        member.quizStats.points += delta;
        member.quizStats.count += 1;
        member.quizStats.correct += quizCorrect ? 1 : 0;
      }
      const previous = member.total;
      member.total += delta;
      const participation = type === "activity.submit" && !bonus;
      if (participation) member.count++;
      if (type === "activity.submit") member.lastAt = now;
      // Monotonic timestamps ensure stable pagination when requests share a millisecond.
      const createdAt = Math.max(now, (member.lastRecordAt || 0) + 1);
      member.lastRecordAt = createdAt;
      const weekMember = board.members[memberId] || {
        memberId,
        nickname: member.nickname,
        points: 0,
        count: 0,
      };
      weekMember.points += delta;
      if (participation) weekMember.count++;
      weekMember.nickname = member.nickname;
      board.members[memberId] = weekMember;
      const record = {
        id: keyOf(user.id, submissionId),
        memberId,
        activityId,
        title,
        summary,
        resultDetails,
        delta,
        ...(outcomeTier ? { outcomeTier } : {}),
        before: previous,
        after: member.total,
        createdAt,
        day: period.day,
        week: period.week,
        version: config.version,
        contentId,
        quizCorrect,
        kind: bonus ? "bonus" : participation ? "participation" : "adjustment",
        ...(bonus ? { bonus: true } : {}),
        operatorId: user.id,
        reason,
      };
      db.set(`member_${memberId}`, member);
      db.set(`day_${keyOf(memberId, period.day)}`, {
        ...day,
        memberId,
        expiresAt: now + 35 * 86400000,
      });
      db.set(`week_${period.week}`, board);
      db.set(`records/ledger/${record.id}`, record);

      db.set(receiptKey, {
        fingerprint,
        result: record,
        memberId,
        ...(type === "activity.submit"
          ? { expiresAt: now + 35 * 86400000 }
          : {}),
      });
      return record;
    },
    { authenticatedUser: user, queueAudit },
  );
}
