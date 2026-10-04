import {
  randomUUID,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
export const id = () => randomUUID();
export function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}
export function hash(password) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function matches(password, value) {
  const [salt, digest] = value.split(":");
  return timingSafeEqual(
    scryptSync(password, salt, 64),
    Buffer.from(digest, "hex"),
  );
}
export function text(value, label, max = 80) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    fail(`${label}請填入 1–${max} 個字元`);
  return value.trim();
}
export function number(value, label, max = 1e12) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > max
  )
    fail(`${label}必須是 0–${max} 的整數`);
  return value;
}
function costNote(value = "") {
  if (typeof value !== "string" || value.length > 300)
    fail("成本備註最多 300 個字元");
  return value.trim();
}
export function periods(now = Date.now()) {
  const day = Math.floor((now - 3600000) / 86400000);
  return { day, week: Math.floor((day - 2) / 7) };
}
export function reset(state, now = Date.now()) {
  state.professions ??= [];
  const p = periods(now);
  for (const c of state.characters) {
    if (c.day !== p.day) {
      c.fatigue = 700;
      c.day = p.day;
    }
    if (c.week !== p.week) {
      c.runs = {};
      c.week = p.week;
    }
  }
}
export function initialState() {
  if (!process.env.INITIAL_ADMIN_PASSWORD)
    fail("請設定 INITIAL_ADMIN_PASSWORD", 503);
  return {
    users: [
      {
        id: id(),
        username: "Wolf",
        password: hash(process.env.INITIAL_ADMIN_PASSWORD),
        discordId: "",
        admin: true,
        active: true,
        version: 0,
      },
    ],
    characters: [],
    professions: [],
    dungeons: [
      { id: id(), name: "森林聖域", max: 7 },
      { id: id(), name: "黑龍巢穴", max: 3 },
      { id: id(), name: "冰封迴廊", max: 5 },
    ],
    listings: [],
    settlements: [],
    webhook: "",
  };
}
export function split(price, cost, taxed, ids) {
  number(price, "販賣金額");
  number(cost, "額外成本");
  if (typeof taxed !== "boolean") fail("稅額設定不正確");
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    new Set(ids).size !== ids.length
  )
    fail("至少選擇一位參與者，且不可重複");
  const tax = taxed ? Math.floor(price / 10) : 0,
    net = price - tax - cost;
  if (net < 0) fail("成本不得超過稅後金額");
  const share = Math.floor(net / ids.length),
    remainder = net % ids.length;
  return {
    tax,
    net,
    share,
    remainder,
    payouts: ids.map((userId) => ({
      userId,
      amount: share,
      claimedAt: null,
    })),
  };
}
export function publicState(s, u) {
  return {
    users: s.users.map(({ password, version, ...rest }) => rest),
    characters: s.characters,
    professions: s.professions || [],
    dungeons: s.dungeons,
    listings: s.listings,
    settlements: s.settlements,
    me:
      s.users.find((x) => x.id === u.id) &&
      (({ password, version, ...rest }) => rest)(u),
    webhookConfigured: !!(s.webhook || process.env.DISCORD_WEBHOOK_URL),
    storage: process.env.FIREBASE_SERVICE_ACCOUNT_JSON ? "Firebase" : "本機",
  };
}
function owned(item, user, field = "ownerId") {
  if (!item) fail("找不到資料", 404);
  if (!user.admin && item[field] !== user.id) fail("沒有修改權限", 403);
  return item;
}
export function action(s, u, type, p, now = Date.now()) {
  reset(s, now);
  const admin = () => {
    if (!u.admin) fail("僅管理員可操作", 403);
  };
  if (type === "profession.save") {
    admin();
    const old = p.id ? s.professions.find((x) => x.id === p.id) : null;
    if (p.id && !old) fail("找不到職業");
    const name = text(p.name, "職業名稱", 40);
    if (
      s.professions.some(
        (x) => x.id !== p.id && x.name.toLowerCase() === name.toLowerCase(),
      )
    )
      fail("職業名稱已存在");
    if (typeof p.color !== "string" || !/^#[0-9a-f]{6}$/i.test(p.color))
      fail("請選擇有效的職業顏色（#RRGGBB）");
    const item = { id: old?.id || id(), name, color: p.color.toLowerCase() };
    if (old) Object.assign(old, item);
    else s.professions.push(item);
    return;
  }
  if (type === "profession.delete") {
    admin();
    s.professions = s.professions.filter((x) => x.id !== p.id);
    for (const c of s.characters)
      if (c.professionId === p.id) c.professionId = "";
    return;
  }
  if (type === "user.save") {
    admin();
    const old = p.id ? s.users.find((x) => x.id === p.id) : null;
    if (p.id && !old) fail("找不到帳號");
    const username = text(p.username, "帳號", 30);
    if (
      s.users.some(
        (x) =>
          x.id !== p.id && x.username.toLowerCase() === username.toLowerCase(),
      )
    )
      fail("帳號已存在");
    const discordId = typeof p.discordId === "string" ? p.discordId.trim() : "";
    if (discordId && !/^\d{17,20}$/.test(discordId))
      fail("Discord ID 應為 17–20 位數字");
    if (old?.admin && p.active === false) fail("不能停用管理員");
    const password = p.password
      ? hash(text(p.password, "密碼", 128))
      : old?.password;
    if (!password) fail("請輸入密碼");
    const item = {
      id: old?.id || id(),
      username,
      discordId,
      password,
      admin: old?.admin || false,
      active: p.active !== false,
      version: (old?.version || 0) + (p.password ? 1 : 0),
    };
    if (old) Object.assign(old, item);
    else s.users.push(item);
    return;
  }
  if (type === "dungeon.save") {
    admin();
    const item = {
      id: p.id || id(),
      name: text(p.name, "副本名稱"),
      max: number(p.max, "副本上限", 999),
    };
    const old = s.dungeons.find((x) => x.id === p.id);
    if (p.id && !old) fail("找不到副本");
    if (old) Object.assign(old, item);
    else s.dungeons.push(item);
    for (const c of s.characters)
      c.runs[item.id] = Math.min(c.runs[item.id] || 0, item.max);
    return;
  }
  if (type === "dungeon.delete") {
    admin();
    s.dungeons = s.dungeons.filter((x) => x.id !== p.id);
    for (const c of s.characters) delete c.runs[p.id];
    return;
  }
  if (type === "character.save") {
    const old = p.id
      ? owned(
          s.characters.find((x) => x.id === p.id),
          u,
        )
      : null;
    const ownerId = u.admin ? p.ownerId || u.id : u.id;
    if (!s.users.some((x) => x.id === ownerId && x.active))
      fail("角色擁有者不存在或已停用");
    const professionId = p.professionId ?? old?.professionId ?? "";
    if (professionId && !s.professions.some((x) => x.id === professionId))
      fail("職業不存在，請重新選擇");
    const item = {
      id: old?.id || id(),
      ownerId,
      professionId,
      name: text(p.name, "角色名稱"),
      hp: number(p.hp, "血量"),
      attack: number(p.attack, "攻擊力"),
      fatigue: number(p.fatigue, "疲勞值", 700),
      runs: old?.runs || {},
      ...periods(now),
    };
    if (old) Object.assign(old, item);
    else s.characters.push(item);
    return;
  }
  if (type === "character.delete") {
    owned(
      s.characters.find((x) => x.id === p.id),
      u,
    );
    s.characters = s.characters.filter((x) => x.id !== p.id);
    return;
  }
  if (type === "character.run") {
    const c = owned(
      s.characters.find((x) => x.id === p.id),
      u,
    );
    const d = s.dungeons.find((x) => x.id === p.dungeonId);
    if (!d) fail("副本不存在");
    c.runs[d.id] = number(p.count, "已完成次數", d.max);
    return;
  }
  if (type === "listing.save") {
    const old = p.id
      ? owned(
          s.listings.find((x) => x.id === p.id),
          u,
        )
      : null;
    if (old?.soldId) fail("已售出物品不可修改");
    split(p.price, p.cost, p.taxed, p.participants);
    if (
      p.participants.some(
        (uid) => !s.users.some((x) => x.id === uid && x.active),
      )
    )
      fail("參與者已停用或不存在");
    const item = {
      id: old?.id || id(),
      ownerId: old?.ownerId || u.id,
      name: text(p.name, "物品名稱"),
      price: p.price,
      cost: p.cost,
      costNote: costNote(p.costNote ?? old?.costNote),
      taxed: p.taxed,
      participants: p.participants,
      createdAt: old?.createdAt || now,
      soldId: null,
    };
    if (old) Object.assign(old, item);
    else s.listings.push(item);
    return;
  }
  if (type === "listing.delete") {
    const item = owned(
      s.listings.find((x) => x.id === p.id),
      u,
    );
    if (item.soldId) fail("已售出交易不可刪除");
    s.listings = s.listings.filter((x) => x.id !== p.id);
    return;
  }
  if (type === "listing.sell") {
    const item = owned(
      s.listings.find((x) => x.id === p.id),
      u,
    );
    if (item.soldId) return item.soldId;
    const result = split(item.price, item.cost, item.taxed, item.participants);
    const settlement = {
      id: id(),
      listingId: item.id,
      ownerId: item.ownerId,
      name: item.name,
      price: item.price,
      cost: item.cost,
      costNote: item.costNote || "",
      taxed: item.taxed,
      ...result,
      payouts: result.payouts.map((x) => ({
        ...x,
        claimedAt: x.userId === item.ownerId ? now : null,
        username: s.users.find((u) => u.id === x.userId).username,
      })),
      createdAt: now,
      completedAt: null,
      notification: "pending",
    };
    settlement.completedAt = settlement.payouts.every((x) => x.claimedAt)
      ? now
      : null;
    item.soldId = settlement.id;
    s.settlements.unshift(settlement);
    return settlement.id;
  }
  if (type === "settlement.claimAll") {
    if (!Array.isArray(p.claims) || p.claims.length === 0)
      fail("請選擇要一次結清的領取項目");
    const ids = new Set();
    const claims = p.claims.map((claim) => {
      if (!claim || typeof claim !== "object" || Array.isArray(claim))
        fail("領取項目格式不正確");
      const settlementId = text(claim.id, "結算編號");
      if (settlementId !== claim.id || ids.has(settlementId))
        fail("結算編號不可空白或重複");
      ids.add(settlementId);
      return {
        id: settlementId,
        amount: number(claim.amount, "確認領取金額", Number.MAX_SAFE_INTEGER),
      };
    });
    // Check the complete confirmation snapshot before changing any payout.
    const targets = claims.map((claim) => {
      const item = s.settlements.find((x) => x.id === claim.id);
      const payout = item?.payouts.find((x) => x.userId === u.id);
      if (!payout || (!payout.claimedAt && payout.amount !== claim.amount))
        fail("結算資料已變更，請重新整理後再次確認一次結清的金額", 409);
      return { item, payout };
    });
    for (const { item, payout } of targets) {
      if (payout.claimedAt) continue;
      payout.claimedAt = now;
      item.completedAt = item.payouts.every((x) => x.claimedAt)
        ? item.completedAt || now
        : null;
    }
    return;
  }
  if (type === "settlement.claim") {
    const item = s.settlements.find((x) => x.id === p.id);
    if (!item) fail("結算不存在");
    if (!u.admin && u.id !== p.userId) fail("只能確認自己的領取狀態", 403);
    const payout = item.payouts.find((x) => x.userId === p.userId);
    if (!payout) fail("參與者不存在");
    payout.claimedAt =
      p.claimed === false && u.admin ? null : payout.claimedAt || now;
    item.completedAt = item.payouts.every((x) => x.claimedAt)
      ? item.completedAt || now
      : null;
    return;
  }
  if (type === "settlement.edit") {
    admin();
    const item = s.settlements.find((x) => x.id === p.id);
    if (!item) fail("結算不存在");
    if (item.payouts.some((x) => x.claimedAt))
      fail("已有領取紀錄，請先撤銷領取再修改金額");
    const result = split(
      p.price,
      p.cost,
      p.taxed,
      item.payouts.map((x) => x.userId),
    );
    Object.assign(item, {
      name: text(p.name, "物品名稱"),
      price: p.price,
      cost: p.cost,
      costNote: costNote(p.costNote ?? item.costNote),
      taxed: p.taxed,
      ...result,
      payouts: result.payouts.map((x, i) => ({
        ...x,
        username: item.payouts[i].username,
      })),
      notification: "pending",
    });
    return;
  }
  if (type === "settlement.delete") {
    admin();
    s.settlements = s.settlements.filter((x) => x.id !== p.id);
    s.listings = s.listings.filter((x) => x.soldId !== p.id);
    return;
  }
  if (type === "webhook.save") {
    admin();
    if (
      p.url &&
      !/^https:\/\/(?:discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[\w-]+$/.test(
        p.url,
      )
    )
      fail("請填入有效的 Discord Webhook URL");
    s.webhook = p.url || "";
    return;
  }
  if (type === "notification.retry") {
    const item = s.settlements.find((x) => x.id === p.id);
    owned(item, u);
    return item.id;
  }
  fail("不支援的操作");
}
