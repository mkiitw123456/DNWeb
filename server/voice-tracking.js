import { activityTransaction } from "./activity-store.js";
import { casinoDay } from "./casino.js";
import { fail } from "./domain.js";

const MAX_GAP = 90000;
export function eligibleVoiceMembers(members, afkChannelId) {
  const people = members.filter((m) => !m.bot && m.channelId !== afkChannelId);
  const counts = new Map();
  for (const m of people)
    counts.set(m.channelId, (counts.get(m.channelId) || 0) + 1);
  return people.filter((m) => counts.get(m.channelId) >= 2).map((m) => m.id);
}
export function validateVoiceSnapshot(p) {
  if (
    !p ||
    typeof p.sessionId !== "string" ||
    !/^[a-f0-9-]{36}$/.test(p.sessionId) ||
    !Number.isSafeInteger(p.sequence) ||
    p.sequence < 1 ||
    !Array.isArray(p.members) ||
    p.members.length > 500
  )
    fail("語音回報格式無效");
  if (p.afkChannelId !== null && !/^\d{17,20}$/.test(p.afkChannelId || ""))
    fail("AFK 頻道無效");
  const ids = new Set();
  for (const m of p.members) {
    if (
      !m ||
      !/^\d{17,20}$/.test(m.id || "") ||
      !/^\d{17,20}$/.test(m.channelId || "") ||
      typeof m.bot !== "boolean" ||
      ids.has(m.id)
    )
      fail("語音成員格式無效");
    ids.add(m.id);
  }
  return {
    sessionId: p.sessionId,
    sequence: p.sequence,
    afkChannelId: p.afkChannelId,
    members: p.members.map(({ id, channelId, bot }) => ({
      id,
      channelId,
      bot,
    })),
  };
}
export function applyVoiceSnapshot(previous, input, now = Date.now()) {
  const p = validateVoiceSnapshot(input);
  const s = structuredClone(
    previous || { totals: {}, days: {}, startedAt: now },
  );
  if (s.sessionId === p.sessionId && p.sequence <= s.sequence) return s;
  const gap = now - (s.lastSeen || now);
  if (
    s.sessionId === p.sessionId &&
    p.sequence === s.sequence + 1 &&
    gap > 0 &&
    gap <= MAX_GAP
  ) {
    const eligible = eligibleVoiceMembers(s.members || [], s.afkChannelId);
    for (let start = s.lastSeen; start < now;) {
      const day = casinoDay(start),
        boundary = Date.parse(`${day}T09:00:00+08:00`) + 86400000,
        end = Math.min(now, boundary),
        duration = end - start;
      const daily = (s.days[day] ||= {});
      for (const id of eligible) {
        // Keep this single bounded statistics document below Firestore's size cap.
        if (!Object.hasOwn(s.totals, id) && Object.keys(s.totals).length >= 500)
          continue;
        s.totals[id] = (s.totals[id] || 0) + duration;
        daily[id] = (daily[id] || 0) + duration;
      }
      start = end;
    }
  }
  const cutoff = casinoDay(now - 29 * 86400000);
  s.days = Object.fromEntries(
    Object.entries(s.days).filter(([day]) => day >= cutoff),
  );
  Object.assign(s, p, { lastSeen: now });
  return s;
}
export async function recordVoiceSnapshot(p, now = Date.now()) {
  return activityTransaction(async (db) => {
    const previous = await db.get("voice_tracking");
    const next = applyVoiceSnapshot(previous, p, now);
    db.set("voice_tracking", next);
    return {
      ok: true,
      receivedAt: next.lastSeen,
      trackedMembers: Object.keys(next.totals).length,
      totalRecordedMs: Object.values(next.totals).reduce(
        (sum, ms) => sum + ms,
        0,
      ),
    };
  });
}
export async function voiceView(user, users, now = Date.now()) {
  if (!user.admin) fail("僅管理員可查看語音統計", 403);
  return activityTransaction(
    async (db) => {
      const s = await db.get("voice_tracking");
      const online = !!s && now - s.lastSeen <= MAX_GAP;
      const active = new Set(
        online ? eligibleVoiceMembers(s.members || [], s.afkChannelId) : [],
      );
      const day = casinoDay(now);
      return {
        day,
        online,
        lastSeen: s?.lastSeen || null,
        startedAt: s?.startedAt || null,
        noRewards: true,
        rows: users
          .filter((u) => u.active && /^\d{17,20}$/.test(u.discordId || ""))
          .map((u) => ({
            id: u.id,
            name: u.nickname || u.username,
            todayMs: s?.days?.[day]?.[u.discordId] || 0,
            totalMs: s?.totals?.[u.discordId] || 0,
            counting: active.has(u.discordId),
          })),
      };
    },
    { authenticatedUser: user },
  );
}
