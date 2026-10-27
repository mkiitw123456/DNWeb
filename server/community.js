import { fail, id, text } from "./domain.js";

export const groupsOf = (s, userId) =>
  s.groups.filter((g) => g.memberIds.includes(userId));

export function communityAction(s, u, type, p, now) {
  if (type === "group.create") {
    const name = text(p.name, "群組名稱", 40);
    s.groups.push({
      id: id(),
      name,
      ownerId: u.id,
      memberIds: [u.id],
      createdAt: now,
    });
  } else if (type === "group.invite") {
    const group = s.groups.find((g) => g.id === p.groupId);
    if (!group || group.ownerId !== u.id) fail("只有群組建立者可以邀請", 403);
    const username = text(p.username, "帳號", 30);
    const target = s.users.find(
      (x) => x.active && x.username.toLowerCase() === username.toLowerCase(),
    );
    if (!target) fail("找不到這個帳號 ID", 404);
    if (group.memberIds.includes(target.id)) fail("此成員已在這個群組內", 409);
    if (
      s.invitations.some(
        (i) => i.groupId === group.id && i.toUserId === target.id,
      )
    )
      fail("已送出邀請，等待對方回覆", 409);
    s.invitations.push({
      id: id(),
      groupId: group.id,
      fromUserId: u.id,
      toUserId: target.id,
      createdAt: now,
    });
  } else if (type === "group.respond") {
    const invite = s.invitations.find(
      (i) => i.id === p.id && i.toUserId === u.id,
    );
    if (!invite) fail("邀請不存在或已處理", 404);
    if (typeof p.accept !== "boolean") fail("請選擇接受或取消");
    if (p.accept) {
      const group = s.groups.find((g) => g.id === invite.groupId);
      if (!group) fail("群組已不存在", 409);
      if (group.memberIds.includes(u.id)) fail("你已在這個群組內", 409);
      group.memberIds.push(u.id);
      s.invitations = s.invitations.filter((i) => i.id !== invite.id);
    } else s.invitations = s.invitations.filter((i) => i.id !== invite.id);
  } else if (type === "group.kick") {
    const group = s.groups.find((g) => g.id === p.groupId);
    if (!group || group.ownerId !== u.id)
      fail("只有群組建立者可以移除成員", 403);
    if (p.userId === u.id) fail("請使用離開群組");
    if (!group.memberIds.includes(p.userId)) fail("此成員不在群組內", 404);
    group.memberIds = group.memberIds.filter((uid) => uid !== p.userId);
  } else if (type === "group.leave") {
    const group = s.groups.find(
      (g) => g.id === p.groupId && g.memberIds.includes(u.id),
    );
    if (!group) fail("你尚未加入群組", 404);
    if (group.ownerId === u.id) {
      s.groups = s.groups.filter((g) => g.id !== group.id);
      s.invitations = s.invitations.filter((i) => i.groupId !== group.id);
    } else group.memberIds = group.memberIds.filter((uid) => uid !== u.id);
  } else if (type === "bounty.save") {
    const old = p.id ? s.bounties.find((b) => b.id === p.id) : null;
    if (p.id && !old) fail("懸賞不存在", 404);
    if (old && !u.admin && old.ownerId !== u.id)
      fail("只能修改自己的懸賞", 403);
    if (!s.dungeons.some((d) => d.id === p.dungeonId)) fail("請選擇有效的關卡");
    const item = {
      id: old?.id || id(),
      name: text(p.name, "懸賞名稱", 80),
      dungeonId: p.dungeonId,
      ownerId: old?.ownerId || u.id,
      createdAt: old?.createdAt || now,
    };
    if (old) Object.assign(old, item);
    else s.bounties.unshift(item);
  } else if (type === "bounty.delete") {
    const item = s.bounties.find((b) => b.id === p.id);
    if (!item) fail("懸賞不存在", 404);
    if (!u.admin && item.ownerId !== u.id) fail("只能刪除自己的懸賞", 403);
    s.bounties = s.bounties.filter((b) => b.id !== item.id);
  } else return false;
  return true;
}
