// A creator is related even when they do not receive a share.
export function isRelated(item, userId) {
  return (
    item.ownerId === userId ||
    (item.participants || []).includes(userId) ||
    (item.payouts || []).some((p) => p.userId === userId)
  );
}
