import { randomUUID } from "node:crypto";
import { fail, text } from "./domain.js";
import { queueDelivery } from "./scheduling.js";
import { allocatePool, allocatePlaces } from "./prize-allocation.js";

const linked = (u) => u?.active && /^\d{17,20}$/.test(u.discordId || "");
function notice(s, room, message, userIds, now) {
  const ids = [
    ...new Set(
      userIds
        .map((id) => s.users.find((u) => u.id === id)?.discordId)
        .filter(Boolean),
    ),
  ];
  queueDelivery(
    s,
    "casino",
    {
      content: `【${room.kind === "prediction" ? "公會預測" : "公會賽馬"}】${room.title}\n${message}\n${ids.map((id) => `<@${id}>`).join(" ")}`,
      allowed_mentions: { parse: [], users: ids },
    },
    { gameRoomId: room.id },
    now,
  );
}
export function advanceGames(s, now) {
  s.gameRooms ||= [];
  for (const r of s.gameRooms) {
    if (r.status === "open" && now >= r.closesAt) {
      r.status = "locked";
      r.lockedAt = now;
      for (const e of r.entries)
        if (e.status === "pending") e.status = "expired";
      notice(
        s,
        r,
        "已截止報名並封盤，等待房主公布遊戲內結果。",
        [r.ownerId],
        now,
      );
    }
  }
  // Keep unsettled and unpaid records; retain completed records for seven days.
  s.gameRooms = s.gameRooms.filter(
    (r) =>
      !r.settledAt ||
      r.payouts?.some((p) => !p.paidAt) ||
      now - r.settledAt < 7 * 86400000,
  );
}
export function settleGame(room, result) {
  const entries = room.entries.filter((e) => e.status === "approved");
  const total = entries.reduce((sum, e) => sum + e.amount, 0);
  if (!total) fail("沒有已確認的報名，請取消並關閉房間");
  let payments = [];
  if (room.kind === "prediction") {
    if (!room.options.some((o) => o.id === result.winner))
      fail("請選擇實際結果");
    const winners = entries.filter((e) => e.optionId === result.winner);
    if (!winners.length) fail("沒有人選中此結果，請取消並按原額退回");
    payments = allocatePool(
      total,
      winners.map((e) => ({ id: e.userId, weight: e.amount })),
    );
  } else {
    if (
      !Array.isArray(result.places) ||
      result.places.length !== 3 ||
      new Set(result.places).size !== 3 ||
      result.places.some((id) => !room.options.some((o) => o.id === id))
    )
      fail("請選擇三位不同的馬手");
    const pots = allocatePlaces(total, room.percentages);
    for (let i = 0; i < 3; i++) {
      const rider = result.places[i],
        supporters = entries.filter((e) => e.optionId === rider);
      if (!supporters.length)
        fail("前三名有未獲支持的馬手，請取消並按原額退回");
      const riderAmount = Math.floor(
        (pots[i].amount * room.riderPercent) / 100,
      );
      payments.push({ id: rider, amount: riderAmount });
      payments.push(
        ...allocatePool(
          pots[i].amount - riderAmount,
          supporters.map((e) => ({ id: e.userId, weight: e.amount })),
        ),
      );
    }
  }
  const merged = new Map();
  for (const p of payments)
    merged.set(p.id, (merged.get(p.id) || 0) + p.amount);
  return [...merged].map(([userId, amount]) => ({
    userId,
    amount,
    paidAt: null,
  }));
}
export function gameAction(s, u, type, p = {}, now = Date.now()) {
  if (!linked(u)) fail("請先完成 Discord 身分綁定與審核", 403);
  advanceGames(s, now);
  if (type === "game.create") {
    if (!["prediction", "race"].includes(p.kind)) fail("玩法無效");
    if (
      s.gameRooms.length >= 30 ||
      s.gameRooms.filter(
        (r) => r.ownerId === u.id && ["open", "locked"].includes(r.status),
      ).length >= 3
    )
      fail("房間數量已達上限，請先完成既有房間");
    const closesAt = Date.parse(p.closesAt);
    if (
      !Number.isFinite(closesAt) ||
      closesAt < now + 60000 ||
      closesAt > now + 7 * 86400000
    )
      fail("截止時間須在一分鐘後至七天內");
    let options = [
      { id: "yes", name: "會" },
      { id: "no", name: "不會" },
    ];
    if (p.kind === "race") {
      if (
        !Array.isArray(p.riders) ||
        p.riders.length < 3 ||
        p.riders.length > 12 ||
        new Set(p.riders).size !== p.riders.length
      )
        fail("請選擇 3 至 12 位不同馬手");
      options = p.riders.map((id) => {
        const rider = s.users.find((x) => x.id === id);
        if (!linked(rider)) fail("馬手須為已綁定且啟用的會員");
        return { id, name: rider.username };
      });
    }
    const room = {
      id: randomUUID(),
      kind: p.kind,
      title: text(p.title, "標題", 80),
      ownerId: u.id,
      ownerName: u.username,
      closesAt,
      createdAt: now,
      status: "open",
      options,
      entries: [],
      percentages: [50, 30, 20],
      riderPercent: 20,
      payouts: [],
    };
    s.gameRooms.push(room);
    notice(s, room, "房間已建立，報名須由房主確認。", [u.id], now);
  } else if (type !== "game.state") {
    const r = s.gameRooms.find((r) => r.id === p.id);
    if (!r) fail("房間不存在", 404);
    if (type === "game.join") {
      if (r.status !== "open") fail("已封盤，不能報名", 409);
      if (r.entries.some((e) => e.userId === u.id))
        fail("每人只能報名一次", 409);
      if (r.entries.length >= 60) fail("房間人數已滿");
      if (!r.options.some((o) => o.id === p.optionId)) fail("請選擇支持對象");
      if (!Number.isSafeInteger(p.amount) || p.amount < 1 || p.amount > 1000000)
        fail("金額須為 1 至 1,000,000 的整數");
      r.entries.push({
        userId: u.id,
        name: u.username,
        optionId: p.optionId,
        amount: p.amount,
        status: "pending",
        joinedAt: now,
      });
      notice(
        s,
        r,
        `${u.username} 申請報名，請房主核對後確認。`,
        [r.ownerId, u.id],
        now,
      );
    } else {
      if (
        r.ownerId !== u.id &&
        !(u.admin && !s.users.some((x) => x.id === r.ownerId && x.active))
      )
        fail("只有房主可以操作", 403);
      if (type === "game.review") {
        if (r.status !== "open") fail("已封盤，不能審核", 409);
        const e = r.entries.find((e) => e.userId === p.userId);
        if (!e || e.status !== "pending" || typeof p.approved !== "boolean")
          fail("申請已處理或資料無效", 409);
        if (p.approved && !linked(s.users.find((x) => x.id === e.userId)))
          fail("此會員已停用或解除綁定");
        e.status = p.approved ? "approved" : "rejected";
      } else if (type === "game.lock") {
        if (r.status !== "open") fail("房間已封盤", 409);
        if (r.entries.some((e) => e.status === "pending"))
          fail("請先處理所有待審核報名");
        r.status = "locked";
        r.lockedAt = now;
        notice(s, r, "房主已封盤，報名與金額已鎖定。", [u.id], now);
      } else if (type === "game.settle") {
        if (r.status !== "locked") fail("須先封盤，且不可重複結算", 409);
        r.payouts = settleGame(r, p);
        r.result =
          r.kind === "prediction"
            ? { winner: p.winner }
            : { places: [...p.places] };
        r.status = "settled";
        r.settledAt = now;
        const outcome =
          r.kind === "prediction"
            ? r.options.find((o) => o.id === p.winner).name
            : p.places
                .map(
                  (id, i) =>
                    `${i + 1}. ${r.options.find((o) => o.id === id).name}`,
                )
                .join("、");
        notice(
          s,
          r,
          `結果：${outcome}\n分配清單已產生，請房主在遊戲內交付並標記。`,
          [u.id],
          now,
        );
      } else if (type === "game.cancel") {
        if (!["open", "locked"].includes(r.status))
          fail("已結束，不可重複取消", 409);
        r.payouts = r.entries
          .filter((e) => e.status === "approved")
          .map((e) => ({ userId: e.userId, amount: e.amount, paidAt: null }));
        r.status = "cancelled";
        r.settledAt = now;
        notice(s, r, "房間已取消，請房主依原額退回清單處理。", [u.id], now);
      } else if (type === "game.paid") {
        if (!["settled", "cancelled"].includes(r.status))
          fail("尚未產生分配清單");
        const row = r.payouts.find((x) => x.userId === p.userId);
        if (!row || row.paidAt) fail("項目不存在或已標記交付", 409);
        row.paidAt = now;
      } else fail("未知玩法操作");
    }
  }
  return {
    serverNow: now,
    rooms: s.gameRooms.map((r) => ({
      ...r,
      canManage:
        r.ownerId === u.id ||
        (u.admin && !s.users.some((x) => x.id === r.ownerId && x.active)),
      entries: r.entries.filter(
        (e) =>
          e.status === "approved" || u.id === r.ownerId || u.id === e.userId,
      ),
    })),
    members: s.users
      .filter(linked)
      .map((x) => ({ id: x.id, name: x.username })),
    webhookConfigured: !!s.discordWebhooks?.casino,
  };
}
