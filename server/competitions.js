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
  const recipients = r.pool ? r.pool.bets : r.entries;
  for (const e of [...recipients].sort((a, b) => b.coins - a.coins)) {
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

function logEvent(room, message) {
  room.events = [...(room.events || []), { at: Date.now(), message }].slice(-100);
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
      logEvent(room, room.ownerName + " 建立比賽");
      s.competitions = [room, ...rooms];
    }
  } else if (type !== "competition.state") {
    if (!room) fail("找不到比賽", 404);
    const poolManager = user.id === room.ownerId || user.admin;
    const management = ["competition.openPool", "competition.lockPool", "competition.removePlayer"].includes(type);
    if (!["competition.join", "competition.bet"].includes(type) && !(management ? poolManager : user.id === room.ownerId))
      fail("只有房主可以操作", 403);
    if (room.total != null) fail("比賽已結算", 409);
    if (type === "competition.join") {
      if (!room.entries.some((e) => e.id === user.id)) {
        if (room.pool) fail("選手報名已截止", 409);
        if (room.entries.length >= 100) fail("本場參賽人數已滿");
        logEvent(room, (user.nickname || user.username) + " 加入比賽");
        room.entries.push({
          id: user.id,
          name: user.nickname || user.username,
          coins: 0,
        });
        room.version++;
      }
    } else if (type === "competition.removePlayer") {
      const entry = room.entries.find(e => e.id === p.memberId);
      if (entry) {
        if (room.version !== p.version) fail("比賽資料已更新，請重新確認移除", 409);
        room.entries = room.entries.filter(e => e.id !== entry.id);
        logEvent(room, (user.nickname || user.username) + " 已移除選手 " + display(s, entry.id, entry.name));
        room.version++;
      }
    } else if (type === "competition.openPool") {
      if (!room.entries.length) fail("請先讓至少一位選手報名");
      if (!room.pool) {
        if (room.entries.some(e => e.coins > 0)) fail("本場已有月亮幣，請沿用原獎池結算");
        room.pool = { bets: [], locked: false };
        logEvent(room, "選手報名截止，獎池開放投注");
        room.version++;
      }
    } else if (type === "competition.lockPool") {
      if (!room.pool) fail("尚未開放獎池");
      if (!room.pool.locked) {
        room.pool.locked = true;
        logEvent(room, "主持人已截止投注");
        room.version++;
      }
    } else if (type === "competition.bet" || type === "competition.enroll") {
      if (!room.pool || room.pool.locked) fail("目前未開放投注", 409);
      const member = type === "competition.bet" ? user : s.users.find(u =>
        u.active && u.username.toLowerCase() === String(p.username || "").trim().toLowerCase());
      if (!member) fail("找不到此成員帳號");
      if (!room.pool.bets.some(b => b.id === member.id)) {
        if (room.pool.bets.length >= 100) fail("獎池名額已滿");
        room.pool.bets.push({id:member.id, name:member.nickname || member.username, coins:0});
        logEvent(room, (member.nickname || member.username) + " 加入獎池");
        room.version++;
      }
    } else if (type === "competition.score") {
      const members = room.pool ? room.pool.bets : room.entries;
      const entry = members.find((e) => e.id === p.memberId);
      if (!entry) fail("請選擇參賽者");
      const coins = number(p.coins, "月亮幣", 1000000000);
      if (entry.coins !== coins) {
        if (entry.coins !== p.previous)
          fail("此成員的月亮幣已變更，請重新確認", 409);
        logEvent(room, display(s, entry.id, entry.name) + " 的月亮幣由 " + entry.coins + " 調整為 " + coins);
        entry.coins = coins;
        room.version++;
      }
    } else if (type === "competition.settle") {
      if (room.version !== p.version)
        fail("參賽者或月亮幣已變更，請重新確認分配", 409);
      const members = room.pool ? room.pool.bets : room.entries;
      const total = number(p.total, "總額", 1000000000);
      if (!total) fail("總額必須大於零");
      const payouts = distribute(members, total);
      members.forEach((e, i) => {
        e.name = display(s, e.id, e.name);
        e.payout = payouts[i];
      });
      logEvent(room, "比賽已結算，獎池總額 " + total);
      room.total = total;
      if (room.pool) room.pool.locked = true;
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
