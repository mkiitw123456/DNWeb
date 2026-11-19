import { randomInt, randomUUID } from "node:crypto";
import { fail, text } from "./domain.js";
import { queueDelivery } from "./scheduling.js";
const name = (u) => u?.nickname || u?.username || "已刪除帳號";
function notice(s, r, message, now) {
  const users = [
    ...new Set(
      [r.ownerId, r.guestId]
        .map((id) => s.users.find((u) => u.id === id)?.discordId)
        .filter(Boolean),
    ),
  ];
  queueDelivery(
    s,
    "casino",
    {
      content: `【星月對決】${r.title}\n${message}\n${users.map((id) => `<@${id}>`).join(" ")}`,
      allowed_mentions: { parse: [], users },
    },
    { duelId: r.id },
    now,
  );
}
export function advanceDuels(s, now = Date.now()) {
  s.duels ||= [];
  for (const r of s.duels) {
    if (r.status === "pending" && now >= r.acceptBy) {
      r.status = "open";
      delete r.guestId;
      delete r.acceptBy;
    }
    if (r.status === "tossing" && now >= r.endsAt) {
      r.status = "completed";
      r.completedAt = r.endsAt;
      r.winnerId = r.outcome === r.side ? r.ownerId : r.guestId;
      notice(
        s,
        r,
        `結果：${r.outcome === "star" ? "星星" : "月亮"}，獲勝者：${name(s.users.find((x) => x.id === r.winnerId))}`,
        now,
      );
    }
  }
  s.duels = s.duels.filter(
    (r) => !r.completedAt || now - r.completedAt < 7 * 86400000,
  );
}
export function duelAction(s, u, type, p = {}, now = Date.now()) {
  if (!u?.active || !/^\d{17,20}$/.test(u.discordId || ""))
    fail("請先綁定 Discord 身分", 403);
  advanceDuels(s, now);
  if (type === "duel.create") {
    if (!["star", "moon"].includes(p.side)) fail("請選擇星星或月亮");
    if (
      s.duels.filter(
        (r) =>
          r.ownerId === u.id && !["completed", "cancelled"].includes(r.status),
      ).length >= 3
    )
      fail("最多同時開啟三個房間");
    if (s.duels.length >= 200) fail("目前房間已滿，請稍後再試");
    const r = {
      id: randomUUID(),
      ownerId: u.id,
      title: text(p.title, "房間標題", 80),
      side: p.side,
      status: "open",
      createdAt: now,
    };
    s.duels.unshift(r);
    notice(s, r, "房間已建立，等待加入。", now);
  } else if (type !== "duel.state") {
    const r = s.duels.find((r) => r.id === p.id);
    if (!r) fail("找不到房間", 404);
    if (type === "duel.join") {
      if (r.status !== "open" || r.ownerId === u.id)
        fail("目前無法加入此房間", 409);
      const owner = s.users.find((x) => x.id === r.ownerId);
      if (!owner?.active || !owner.discordId) fail("房主目前無法接受報名");
      r.guestId = u.id;
      r.status = "pending";
      r.acceptBy = now + 100000;
      notice(s, r, `${name(u)} 已加入，請房主在 100 秒內確認。`, now);
    } else if (type === "duel.accept") {
      if (r.ownerId !== u.id) fail("僅房主可接受", 403);
      if (r.status !== "pending" || now >= r.acceptBy)
        fail("報名已逾時或已處理", 409);
      const guest = s.users.find((x) => x.id === r.guestId);
      if (!guest?.active || !guest.discordId) fail("參加者已無法參與");
      r.status = "tossing";
      r.startsAt = now + 10000;
      r.endsAt = r.startsAt + 5200;
      // Server outcome is independent of the cosmetic number of rotations.
      r.outcome = randomInt(2) === 0 ? "star" : "moon";
      r.turns = randomInt(8, 13);
      notice(s, r, "房主已接受，10 秒後拋出硬幣。", now);
    } else if (type === "duel.reject" || type === "duel.leave") {
      if (r.status !== "pending") fail("目前無法取消報名", 409);
      if (type === "duel.reject" ? r.ownerId !== u.id : r.guestId !== u.id)
        fail("沒有權限", 403);
      r.status = "open";
      delete r.guestId;
      delete r.acceptBy;
    } else if (type === "duel.cancel") {
      if (r.ownerId !== u.id || r.status !== "open")
        fail("只能取消自己尚無人報名的房間", 409);
      r.status = "cancelled";
      r.completedAt = now;
    } else fail("未知操作");
  }
  return {
    serverNow: now,
    rooms: s.duels.map((r) => {
      const { outcome, turns, ...rest } = r;
      return {
        ...rest,
        ...(now >= r.startsAt ? { outcome, turns } : {}),
        ownerName: name(s.users.find((x) => x.id === r.ownerId)),
        guestName: r.guestId
          ? name(s.users.find((x) => x.id === r.guestId))
          : "",
        winnerName: r.winnerId
          ? name(s.users.find((x) => x.id === r.winnerId))
          : "",
      };
    }),
  };
}
