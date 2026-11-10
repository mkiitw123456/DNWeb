import { fail, id, text } from "./domain.js";
export function isOwner(s, u) {
  return !!u.admin && s.adminOwnerId === u.id;
}
export function raidView(s, r) {
  return {
    ...r,
    slots: r.slots.map((slot) => {
      if (!slot) return null;
      const c = s.characters.find((c) => c.id === slot.characterId);
      const owner = s.users.find((u) => u.id === slot.ownerId);
      return {
        ...slot,
        name: c?.name || slot.name,
        professionId: c?.professionId ?? slot.professionId,
        username: owner?.username || slot.username,
        unavailable: !c || c.ownerId !== slot.ownerId || !owner?.active,
      };
    }),
  };
}
export function schedulingAction(s, u, type, p, now) {
  if (
    !type.startsWith("raid.") &&
    !type.startsWith("raidTemplate.") &&
    !["user.role", "discordSettings.save", "delivery.retry"].includes(type)
  )
    return false;
  if (!u.admin) fail("僅管理員可操作", 403);
  if (type === "raidTemplate.save") {
    const raid = s.raids.find((r) => r.id === p.raidId);
    if (!raid) fail("找不到要儲存的出團名單", 404);
    if (p.revision !== raid.revision) fail("排班已更新，請重新儲存範本", 409);
    const name = text(p.name, "範本名稱", 60);
    if (
      s.raidTemplates.some((t) => t.name.toLowerCase() === name.toLowerCase())
    )
      fail("範本名稱已存在，請使用其他名稱");
    if (s.raidTemplates.length >= 100)
      fail("最多儲存 100 個常用名單，請先刪除不需要的範本");
    s.raidTemplates.push({
      id: id(),
      name,
      dungeonId: raid.dungeonId,
      dungeonName: raid.dungeonName,
      slots: raid.slots.map((x) => x?.characterId || null),
      createdAt: now,
    });
    return true;
  }
  if (type === "raidTemplate.delete") {
    s.raidTemplates = s.raidTemplates.filter((t) => t.id !== p.id);
    return true;
  }
  if (type === "user.role") {
    if (!isOwner(s, u)) fail("只有主要管理員可以授予或撤銷管理員權限", 403);
    const target = s.users.find((x) => x.id === p.id);
    if (!target || !target.active) fail("帳號不存在或已停用", 404);
    if (target.id === s.adminOwnerId) fail("不能變更主要管理員權限");
    if (typeof p.admin !== "boolean") fail("權限設定不正確");
    target.admin = p.admin;
    return true;
  }
  if (type === "discordSettings.save") {
    if (!["log", "raid"].includes(p.channel)) fail("通知類型不正確");
    if (
      typeof p.url !== "string" ||
      (p.url &&
        !/^https:\/\/(?:discord\.com|discordapp\.com)\/api\/webhooks\/\d{17,20}\/[\w-]+$/.test(
          p.url,
        ))
    )
      fail("請填入有效的 Discord Webhook URL");
    s.discordWebhooks[p.channel] = p.url;
    return true;
  }
  if (type === "delivery.retry") {
    const event = s.deliveries.find((x) => x.id === p.id);
    if (!event || event.channel !== "log") fail("找不到通知紀錄", 404);
    if (
      !["failed", "unconfigured"].includes(event.status) &&
      !(
        ["pending", "sending"].includes(event.status) &&
        now - (event.attemptAt || event.createdAt) > 60000
      )
    )
      fail("此通知不需要重試");
    event.status = "pending";
    return true;
  }
  const old = p.id ? s.raids.find((r) => r.id === p.id) : null;
  if (p.id && !old) fail("找不到出團排班", 404);
  if (old && p.revision !== old.revision)
    fail("排班已被更新，請重新開啟後再操作", 409);
  if (
    old &&
    s.deliveries.some(
      (e) =>
        e.raidId === old.id &&
        ["pending", "sending"].includes(e.status) &&
        now - (e.attemptAt || e.createdAt) < 60000,
    )
  )
    fail("通知傳送中，請稍後再修改", 409);
  if (type === "raid.save") {
    const startsAt = Date.parse(p.startsAt);
    if (
      !Number.isFinite(startsAt) ||
      startsAt < now - 60000 ||
      startsAt > now + 366 * 86400000
    )
      fail("請選擇未來一年內的出團時間");
    const dungeon = s.dungeons.find((d) => d.id === p.dungeonId);
    if (!dungeon) fail("請選擇副本");
    if (!Array.isArray(p.slots) || p.slots.length !== 8)
      fail("排班必須包含八個位置");
    const owners = new Set();
    const slots = p.slots.map((characterId) => {
      if (characterId === null) return null;
      const c = s.characters.find((c) => c.id === characterId);
      const owner = c && s.users.find((x) => x.id === c.ownerId && x.active);
      if (!c || !owner) fail("角色已刪除或帳號已停用，請重新選擇");
      if (owners.has(owner.id)) fail("同一帳號每團只能安排一個角色");
      owners.add(owner.id);
      return {
        characterId: c.id,
        ownerId: owner.id,
        name: c.name,
        username: owner.username,
        professionId: c.professionId || "",
      };
    });
    const raid = {
      id: old?.id || id(),
      startsAt,
      dungeonId: dungeon.id,
      dungeonName: dungeon.name,
      slots,
      revision: (old?.revision || 0) + 1,
      createdBy: old?.createdBy || u.id,
      createdAt: old?.createdAt || now,
      updatedAt: now,
      notification: "unsent",
    };
    if (old) Object.assign(old, raid);
    else s.raids.push(raid);
    return true;
  }
  if (!old) fail("找不到出團排班", 404);
  if (type === "raid.delete") {
    s.raids = s.raids.filter((r) => r.id !== old.id);
    return true;
  }
  if (type === "raid.notify") {
    if (old.startsAt < now) fail("出團時間已過，請先調整時間");
    const view = raidView(s, old);
    if (!view.slots.some(Boolean)) fail("請先安排至少一位成員");
    if (view.slots.some((x) => x?.unavailable))
      fail("部分角色已刪除或停用，請先更新名單");
    old.notificationEventId = queueDelivery(
      s,
      "raid",
      raidMessage(s, view),
      { raidId: old.id, revision: old.revision },
      now,
    );
    old.notification = "pending";
    old.notificationAt = now;
    return true;
  }
  fail("不支援的排班操作");
}
const escape = (value) =>
  String(value)
    .replace(/[\\*_~`>|@<#\[\]]/g, "\\$&")
    .replace(/[\r\n]/g, " ");
export function raidMessage(s, r) {
  const timestamp = Math.floor(r.startsAt / 1000);
  const local = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(r.startsAt);
  const mentions = [
    ...new Set(
      r.slots
        .filter(Boolean)
        .map((slot) => s.users.find((u) => u.id === slot.ownerId)?.discordId)
        .filter((x) => /^\d{17,20}$/.test(x)),
    ),
  ];
  const rows = r.slots.map((slot, i) => {
    if (!slot) return `${i + 1}. 待補`;
    const profession = s.professions.find((p) => p.id === slot.professionId);
    return `${profession?.discordEmoji || (profession ? "[" + escape(profession.name) + "]" : "▫️")} ${escape(slot.name).slice(0, 100)}`;
  });
  return {
    content: `${local}（台灣時間 · <t:${timestamp}:R>）\n**${escape(r.dungeonName)}**\n${rows.join("\n")}\n${mentions.map((x) => `<@${x}>`).join(" ")}`,
    allowed_mentions: { parse: [], users: mentions },
  };
}
export function queueDelivery(
  s,
  channel,
  message,
  extra = {},
  now = Date.now(),
) {
  const event = {
    id: id(),
    channel,
    message,
    ...extra,
    status: "pending",
    createdAt: now,
  };
  s.deliveries.push(event);
  // Keep a bounded audit history without removing in-flight notifications.
  s.deliveries = s.deliveries.filter(
    (e, i, a) =>
      i >= a.length - 100 || ["pending", "sending"].includes(e.status),
  );
  return event.id;
}
export function audit(s, u, type, p, now = Date.now()) {
  const labels = {
    register: "建立帳號",
    "user.save": p.id ? "修改帳號" : "建立帳號",
    "character.save": p.id ? "修改角色" : "建立角色",
    "character.delete": "刪除角色",
    "character.run": "更新副本次數",
    "character.complete": "完成副本",
    "character.quantity": "更新數量",
    "raidTemplate.save": "儲存常用出團名單",
    "raidTemplate.delete": "刪除常用出團名單",
    "raid.save": p.id ? "修改出團排班" : "建立出團排班",
    "raid.delete": "刪除出團排班",
    "raid.notify": "發送出團通知",
    "user.role": "調整管理員權限",
    "profession.save": "修改職業",
    "dungeon.save": "修改副本",
    "discordSettings.save": "更新通知設定",
    "listing.sell": "物品售出",
    "settlement.claim": "確認領取",
    "settlement.claimAll": "一次領取",
  };
  if (!labels[type]) return null;
  const name =
    p.name ||
    p.username ||
    s.characters.find((c) => c.id === p.id)?.name ||
    s.users.find((x) => x.id === p.id)?.username ||
    s.raids.find((r) => r.id === p.id)?.dungeonName ||
    "";
  return queueDelivery(
    s,
    "log",
    {
      content: `【${labels[type]}】${escape(u.username)}${name ? " · " + escape(name) : ""}\n<t:${Math.floor(now / 1000)}:F>`,
      allowed_mentions: { parse: [] },
    },
    {},
    now,
  );
}
