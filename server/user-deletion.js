import { fail } from "./domain.js";
import { isOwner } from "./scheduling.js";
export const DEPLOYMENT_TEST = {
  id: "c2a50970-720f-4802-92ed-147596114f15",
  username: "QA_Deploy_20261116",
};
export function removeUser(s, actor, p, { migration = false } = {}) {
  const target = s.users.find((u) => u.id === p.id);
  if (!target) fail("找不到帳號", 404);
  if (!migration) {
    if (!actor?.admin) fail("僅管理員可操作", 403);
    if (target.id === actor.id || target.id === s.adminOwnerId)
      fail("不能刪除自己或主要管理員", 403);
    if (target.admin && !isOwner(s, actor))
      fail("只有主要管理員可刪除其他管理員", 403);
    if (p.username !== target.username) fail("請輸入完整帳號名稱確認刪除");
  } else if (
    target.id !== DEPLOYMENT_TEST.id ||
    target.username !== DEPLOYMENT_TEST.username ||
    target.admin
  )
    fail("測試帳號識別不符，停止清理", 409);
  const uid = target.id,
    chars = new Set(
      s.characters.filter((c) => c.ownerId === uid).map((c) => c.id),
    );
  for (const r of s.duels || []) {
    if (
      [r.ownerId, r.guestId].includes(uid) &&
      ["open", "pending"].includes(r.status)
    ) {
      r.status = "cancelled";
      r.completedAt = Date.now();
    }
  }
  s.users = s.users.filter((u) => u.id !== uid);
  s.characters = s.characters.filter((c) => c.ownerId !== uid);
  for (const key of [
    "bounties",
    "itemPosts",
    "groups",
    "listings",
    "settlements",
  ])
    s[key] = (s[key] || []).filter((x) => x.ownerId !== uid);
  for (const g of s.groups)
    g.memberIds = (g.memberIds || []).filter((x) => x !== uid);
  s.invitations = (s.invitations || []).filter(
    (x) =>
      x.fromUserId !== uid &&
      x.toUserId !== uid &&
      s.groups.some((g) => g.id === x.groupId),
  );
  for (const l of s.listings)
    l.participants = (l.participants || []).filter((x) => x !== uid);
  for (const t of s.settlements)
    for (const p of t.payouts || [])
      if (p.userId === uid) {
        p.userId = "deleted-account";
        p.username = "已刪除帳號";
        delete p.discordInteractionId;
      }
  for (const r of s.raids || []) {
    r.slots = r.slots.map((x) =>
      x?.ownerId === uid || chars.has(x?.characterId) ? null : x,
    );
    if (r.createdBy === uid) r.createdBy = "deleted-account";
  }
  for (const t of s.raidTemplates || [])
    t.slots = t.slots.map((x) => (chars.has(x) ? null : x));
  s.deliveries = (s.deliveries || []).filter(
    (x) =>
      x.actorId !== uid &&
      x.targetId !== uid &&
      !x.message?.content?.replaceAll("\\", "").includes(target.username),
  );
  s.casinoRooms = (s.casinoRooms || []).filter((r) => r.ownerId !== uid);
  for (const r of s.casinoRooms) {
    r.entries = r.entries.filter((e) => e.userId !== uid);
    for (const e of r.eligible || []) {
      if (e.userId === uid) {
        e.name = "已刪除帳號";
        e.userId = "deleted-account";
      }
    }
    if (r.winnerId === uid) {
      r.winnerId = "deleted-account";
      r.resultMention = "";
    }
  }
  s.pendingUserDeletions ??= [];
  if (!s.pendingUserDeletions.some((j) => j.id === uid))
    s.pendingUserDeletions.push({
      id: uid,
      discordId: target.discordId || "",
      createdAt: Date.now(),
    });
  for (const room of s.gameRooms || []) {
    if (room.ownerId === uid) room.ownerName = "已刪除帳號";
    for (const entry of room.entries)
      if (entry.userId === uid) entry.name = "已刪除帳號";
    for (const option of room.options)
      if (option.id === uid) option.name = "已刪除帳號";
  }
  return uid;
}
