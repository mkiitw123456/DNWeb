import { fail, number, text } from "./domain.js";
import { roomCreateId, changedRoomDraft } from "./room-create.js";
import { queueDelivery } from "./scheduling.js";

export function distribute(entries, total) {
  const weight = entries.reduce((sum, e) => sum + BigInt(e.coins), 0n);
  if (!weight) fail("至少要有一位參賽者持有月亮幣才能結算");
  const shares = entries.map((e, index) => {
    const value = BigInt(total) * BigInt(e.coins);
    return { index, value: Number(value / weight), remainder: value % weight };
  });
  const left = total - shares.reduce((sum, share) => sum + share.value, 0);
  const ranked = [...shares].sort((a, b) =>
    a.remainder === b.remainder
      ? a.index - b.index
      : a.remainder > b.remainder
        ? -1
        : 1,
  );
  for (const share of ranked.slice(0, left)) share.value++;
  return shares.map((s) => s.value);
}

const display = (s, id, fallback) => {
  const user = s.users.find((u) => u.id === id);
  return user?.nickname || user?.username || fallback;
};
const plain = (str) =>
  str
    .replace(/[\r\n]/g, " ")
    .replace(/@/g, "＠")
    .replace(/[<>`*_~|]/g, "");

function settlementNotice(s, r) {
  const heading = `比賽結算 · ${plain(r.title)}（總額 ${r.total}）`;
  let lines = [heading],
    mentions = [];
  function enqueue() {
    queueDelivery(
      s,
      "casino",
      {
        content: lines.join("\n"),
        allowed_mentions: { parse: [], users: mentions },
      },
      { competitionId: r.id },
    );
    lines = [heading];
    mentions = [];
  }
  for (const e of [...r.entries].sort((a, b) => b.coins - a.coins)) {
    const user = s.users.find((u) => u.id === e.id);
    const id = /^\d{17,20}$/.test(user?.discordId || "")
      ? user.discordId
      : null;
    const line = `${id ? "<@" + id + ">" : plain(e.name)} · ${e.coins} 月亮幣 → ${e.payout}`;
    if (
      lines.join("\n").length + line.length + 1 > 1900 ||
      mentions.length >= 90
    )
      enqueue();
    lines.push(line);
    if (id) mentions.push(id);
  }
  enqueue();
}

export function competitionAction(s, user, type, p = {}) {
  const rooms = s.competitions || [];
  let room = rooms.find((r) => r.id === p.id);
  if (type === "competition.create") {
    const id = roomCreateId(type, user.id, p.submissionId),
      title = text(p.title, "比賽名稱");
    const description = text(p.description, "比賽內文", 1500);
    if (
      typeof p.scheduledAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(p.scheduledAt)
    )
      fail("請輸入有效的台灣日期時間");
    const scheduledAt = Date.parse(p.scheduledAt + ":00+08:00");
    if (
      !Number.isFinite(scheduledAt) ||
      new Date(scheduledAt + 28800000).toISOString().slice(0, 16) !==
        p.scheduledAt
    )
      fail("預計時間無效");
    room = rooms.find((r) => r.id === id);
    if (
      room &&
      (room.title !== title ||
        room.description !== description ||
        room.scheduledAt !== scheduledAt)
    )
      changedRoomDraft();
    if (!room) {
      room = {
        id,
        title,
        description,
        scheduledAt,
        ownerId: user.id,
        ownerName: user.nickname || user.username,
        entries: [],
        version: 0,
        total: null,
      };
      s.competitions = [room, ...rooms];
    }
  } else if (type !== "competition.state") {
    if (!room) fail("找不到比賽", 404);
    if (type !== "competition.join" && user.id !== room.ownerId)
      fail("只有房主可以操作", 403);
    if (room.total != null) fail("比賽已結算", 409);
    if (type === "competition.join") {
      if (!room.entries.some((e) => e.id === user.id)) {
        if (room.entries.length >= 100) fail("本場參賽人數已滿");
        room.entries.push({
          id: user.id,
          name: user.nickname || user.username,
          coins: 0,
        });
        room.version++;
      }
    } else if (type === "competition.score") {
      const entry = room.entries.find((e) => e.id === p.memberId);
      if (!entry) fail("請選擇參賽者");
      const coins = number(p.coins, "月亮幣", 1000000000);
      if (entry.coins !== coins) {
        if (entry.coins !== p.previous)
          fail("此成員的月亮幣已變更，請重新確認", 409);
        entry.coins = coins;
        room.version++;
      }
    } else if (type === "competition.settle") {
      if (room.version !== p.version)
        fail("參賽者或月亮幣已變更，請重新確認分配", 409);
      const total = number(p.total, "總額", 1000000000);
      if (!total) fail("總額必須大於零");
      const payouts = distribute(room.entries, total);
      room.entries.forEach((e, i) => {
        e.name = display(s, e.id, e.name);
        e.payout = payouts[i];
      });
      room.total = total;
      room.version++;
      s.deliveries ||= [];
      settlementNotice(s, room);
    } else fail("未知操作");
  }
  return {
    rooms: (s.competitions || []).map((r) => ({
      id: r.id,
      title: r.title,
      scheduledAt: r.scheduledAt,
      count: r.entries.length,
      total: r.total,
    })),
    room: room
      ? {
          ...room,
          ownerName: display(s, room.ownerId, room.ownerName),
          entries: room.entries.map((e) => ({
            ...e,
            name: room.total == null ? display(s, e.id, e.name) : e.name,
          })),
        }
      : null,
  };
}
