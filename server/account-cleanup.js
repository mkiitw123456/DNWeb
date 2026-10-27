import { fail } from "./domain.js";

export const removedAccountNames = ["Wolf", "shomen", "Avalon", "Ricky"];
export function cleanupAccounts(s) {
  if (s.accountCleanupCompleted) fail("帳號整理已執行，不能重複執行", 409);
  const successor = s.users.find(
    (u) => u.username.toLowerCase() === "mrairwolf" && u.active,
  );
  if (!successor)
    fail("請先確認現有 MrAirWolf 帳號已註冊且啟用，尚未變更任何資料", 409);
  const names = new Set(removedAccountNames.map((n) => n.toLowerCase()));
  const ids = new Set(
    s.users.filter((u) => names.has(u.username.toLowerCase())).map((u) => u.id),
  );
  successor.admin = true;
  s.users = s.users.filter((u) => !ids.has(u.id));
  s.characters = s.characters.filter((c) => !ids.has(c.ownerId));
  s.bounties = (s.bounties || []).filter((b) => !ids.has(b.ownerId));
  s.groups = (s.groups || []).filter((g) => !ids.has(g.ownerId));
  for (const g of s.groups)
    g.memberIds = g.memberIds.filter((uid) => !ids.has(uid));
  s.invitations = (s.invitations || []).filter(
    (i) =>
      !ids.has(i.fromUserId) &&
      !ids.has(i.toUserId) &&
      s.groups.some((g) => g.id === i.groupId),
  );
  const removedListings = new Set(
    s.listings.filter((l) => ids.has(l.ownerId)).map((l) => l.id),
  );
  s.settlements = s.settlements.filter(
    (x) => !ids.has(x.ownerId) && !removedListings.has(x.listingId),
  );
  for (const x of s.settlements)
    for (const p of x.payouts) {
      if (ids.has(p.userId)) {
        p.userId = "deleted-account";
        p.username = "已刪除帳號";
        delete p.discordInteractionId;
      }
    }
  s.listings = s.listings.filter((l) => !ids.has(l.ownerId));
  for (const l of s.listings)
    l.participants = l.participants.filter((uid) => !ids.has(uid));
  s.listings = s.listings.filter((l) => l.soldId || l.participants.length);
  s.accountCleanupCompleted = true;
  return successor;
}
