import { randomInt, randomUUID } from "node:crypto";
import { fail, text } from "./domain.js";
import { queueDelivery } from "./scheduling.js";

export const casinoDay = (now) =>
  new Date(now - 3600000).toISOString().slice(0, 10);
const linked = (u) => u?.active && /^\d{17,20}$/.test(u.discordId || "");
function notice(s, r, content, ids, now) {
  queueDelivery(
    s,
    "casino",
    {
      content,
      allowed_mentions: { parse: [], users: [...new Set(ids.filter(Boolean))] },
    },
    { casinoRoomId: r.id },
    now,
  );
}
export function settleCasino(s, now = Date.now()) {
  s.casinoRooms ||= [];
  s.deliveries ||= [];
  for (const r of s.casinoRooms) {
    if (r.status !== "open" || now < r.startsAt) continue;
    const owner = s.users.find((u) => u.id === r.ownerId);
    r.eligible = r.entries.filter(
      (e) =>
        e.status === "approved" &&
        linked(s.users.find((u) => u.id === e.userId)),
    );
    r.status = linked(owner) && r.eligible.length ? "drawn" : "cancelled";
    r.settledAt = now;
    if (r.status === "drawn") {
      r.winnerId = r.eligible[randomInt(r.eligible.length)].userId;
      r.spin = {
        startsAt: now + 3000,
        turns: randomInt(7, 13),
        duration: randomInt(8500, 12501),
        acceleration: randomInt(18, 30) / 100,
        cruise: randomInt(8, 17) / 100,
        offset: randomInt(25, 76) / 100,
      };
      const winner = s.users.find((u) => u.id === r.winnerId);
      // Send the result after the shared animation has finished.
      r.notifyAt = r.spin.startsAt + r.spin.duration;
      r.resultMention = winner.discordId;
    } else {
      notice(
        s,
        r,
        `【抽獎取消】${r.title}\n沒有合格參加者或房主帳號已停用。`,
        [],
        now,
      );
      r.notified = true;
    }
  }
  for (const r of s.casinoRooms) {
    if (r.status === "drawn" && !r.notified && now >= r.notifyAt) {
      const host = s.users.find((u) => u.id === r.ownerId);
      notice(
        s,
        r,
        `【抽獎結果】${r.title}\n恭喜 ${r.resultMention ? `<@${r.resultMention}>` : "已刪除帳號"} 得獎！\n請房主 ${host?.discordId ? `<@${host.discordId}>` : r.ownerName} 聯絡贏家交付獎品。`,
        [r.resultMention, host?.discordId],
        now,
      );
      r.notified = true;
    }
  }
  // Purge completed history at the next Taipei 09:00 boundary; retain ongoing rooms.
  s.casinoRooms = s.casinoRooms.filter(
    (r) =>
      r.status === "open" ||
      !r.notified ||
      casinoDay(r.settledAt) === casinoDay(now),
  );
}
export function casinoAction(s, u, type, p = {}, now = Date.now()) {
  if (!linked(u)) fail("請先完成 Discord 身分綁定與審核後使用抽獎", 403);
  settleCasino(s, now);
  if (type === "casino.create") {
    const title = text(p.title, "獎池標題", 80);
    const startsAt = Date.parse(p.startsAt);
    if (
      !Number.isFinite(startsAt) ||
      startsAt < now + 60000 ||
      startsAt > now + 7 * 86400000
    )
      fail("抽獎時間須在一分鐘後至七天內");
    if (s.casinoRooms.length >= 20)
      fail("獎池已達上限，請待歷史紀錄清理後再建立");
    if (
      s.casinoRooms.filter((r) => r.ownerId === u.id && r.status === "open")
        .length >= 3
    )
      fail("每人最多同時建立三個獎池");
    s.casinoRooms.push({
      id: randomUUID(),
      title,
      startsAt,
      ownerId: u.id,
      ownerName: u.nickname || u.username,
      status: "open",
      createdAt: now,
      entries: [
        {
          userId: u.id,
          name: u.nickname || u.username,
          status: "approved",
          joinedAt: now,
        },
      ],
    });
  } else if (type !== "casino.state") {
    const r = s.casinoRooms.find((r) => r.id === p.id);
    if (!r) fail("獎池已清理或不存在", 404);
    if (r.status !== "open" || now >= r.startsAt)
      fail("已截止，不能變更報名名單", 409);
    if (type === "casino.join") {
      if (r.entries.some((e) => e.userId === u.id))
        fail("已申請過此獎池，請查看審核狀態", 409);
      if (r.entries.length >= 60) fail("報名人數已達上限");
      r.entries.push({
        userId: u.id,
        name: u.nickname || u.username,
        status: "pending",
        joinedAt: now,
      });
      const owner = s.users.find((x) => x.id === r.ownerId);
      notice(
        s,
        r,
        `【抽獎報名】${r.title}\n<@${owner.discordId}>，<@${u.discordId}> 申請加入，請到網站審核參加資格。`,
        [owner.discordId, u.discordId],
        now,
      );
    } else if (type === "casino.review") {
      if (r.ownerId !== u.id) fail("只有房主可以審核", 403);
      const entry = r.entries.find((e) => e.userId === p.userId);
      if (!entry || entry.status !== "pending") fail("申請不存在或已處理", 409);
      if (typeof p.approved !== "boolean") fail("審核狀態錯誤");
      entry.status = p.approved ? "approved" : "rejected";
    } else fail("未知抽獎操作", 400);
  }
  return {
    serverNow: now,
    webhookConfigured: !!s.discordWebhooks?.casino,
    rooms: s.casinoRooms.map((r) => ({
      id: r.id,
      title: r.title,
      ownerId: r.ownerId,
      ownerName:
        s.users.find((x) => x.id === r.ownerId)?.nickname || r.ownerName,
      startsAt: r.startsAt,
      status: r.status,
      settledAt: r.settledAt || null,
      winnerId: r.winnerId || null,
      spin: r.spin || null,
      eligible: (r.eligible || []).map((e) => ({
        ...e,
        name: s.users.find((x) => x.id === e.userId)?.nickname || e.name,
      })),
      entries: r.entries
        .filter(
          (e) =>
            e.status === "approved" || r.ownerId === u.id || e.userId === u.id,
        )
        .map((e) => ({
          ...e,
          name: s.users.find((x) => x.id === e.userId)?.nickname || e.name,
        })),
    })),
  };
}
