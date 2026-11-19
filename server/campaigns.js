import { adventureScripts } from "./adventure-scripts.js";
import { fail } from "./domain.js";

function scripts(events) {
  const journey = events
    .filter((e) => /^journey-\d+$/.test(e.id))
    .sort((a, b) => Number(a.id.slice(8)) - Number(b.id.slice(8)));
  return [
    {
      id: "journey",
      title: "停鐘之旅",
      description: "從故鄉停住的水輪出發，追查失落的鐘聲。",
      events: journey,
    },
    ...adventureScripts,
  ].filter((s) => s.events.length);
}

export function scriptCatalog(events) {
  return scripts(events).map(({ id, title, description, events }) => ({
    id,
    title,
    description,
    chapters: events.length,
  }));
}

export function validateCampaigns(entries, events) {
  if (!Array.isArray(entries) || entries.length > 100)
    fail("正式劇本最多可安排 100 個檔期");
  const available = new Set(scripts(events).map((s) => s.id));
  const seen = new Set();
  return entries
    .map((entry) => {
      const { startDay, scriptId } = entry || {};
      const date = new Date(`${startDay}T00:00:00Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(startDay) ||
        !Number.isFinite(+date) ||
        date.toISOString().slice(0, 10) !== startDay
      )
        fail("請選擇有效的劇本開始日");
      if (seen.has(startDay)) fail("同一天只能安排一個劇本");
      if (!available.has(scriptId)) fail("找不到所選劇本或劇本已無章節");
      seen.add(startDay);
      return { startDay, scriptId };
    })
    .sort((a, b) => a.startDay.localeCompare(b.startDay));
}

export function currentCampaign(config, day, member) {
  const entry = config.campaignSchedule?.findLast((e) => e.startDay <= day);
  if (!entry) return null;
  const script = scripts(config.events).find((s) => s.id === entry.scriptId);
  if (!script) fail("本期劇本缺少章節，請聯絡管理員", 409);
  const key = `${entry.startDay}_${script.id}`;
  const progress = member.campaignProgress?.[key] || 0;
  return {
    key,
    progress,
    title: script.title,
    length: script.events.length,
    chapter: script.events[progress],
  };
}
