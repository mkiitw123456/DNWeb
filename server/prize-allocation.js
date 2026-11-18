// Integer-only allocation for guild game tokens. No wallet or payment handling.
// Largest remainder rounding preserves the pool exactly, even for small pools.
export function allocatePool(total, shares) {
  if (!Number.isSafeInteger(total) || total < 0)
    throw new Error("獎池必須是非負整數");
  if (!Array.isArray(shares) || !shares.length || shares.length > 500)
    throw new Error("分配名單無效");
  const ids = new Set();
  for (const share of shares) {
    if (typeof share.id !== "string" || !share.id || ids.has(share.id))
      throw new Error("分配對象不可重複或空白");
    ids.add(share.id);
    if (!Number.isSafeInteger(share.weight) || share.weight < 0)
      throw new Error("分配權重必須是非負整數");
  }
  const weight = shares.reduce((n, s) => n + BigInt(s.weight), 0n);
  if (!weight) throw new Error("沒有可分配的參與者");
  const rows = shares.map((s) => {
    const value = BigInt(total) * BigInt(s.weight);
    return {
      id: s.id,
      amount: Number(value / weight),
      remainder: value % weight,
    };
  });
  const remainder = total - rows.reduce((n, s) => n + s.amount, 0);
  // Stable ID ordering resolves equal fractions independently of submission order.
  const ranked = [...rows].sort((a, b) =>
    a.remainder === b.remainder
      ? a.id < b.id
        ? -1
        : a.id > b.id
          ? 1
          : 0
      : a.remainder > b.remainder
        ? -1
        : 1,
  );
  for (let i = 0; i < remainder; i++) ranked[i].amount++;
  return rows.map(({ id, amount }) => ({ id, amount }));
}

export function allocatePlaces(total, percentages) {
  if (
    !Array.isArray(percentages) ||
    percentages.length !== 3 ||
    percentages.some((n) => !Number.isInteger(n) || n < 0) ||
    percentages.reduce((a, b) => a + b, 0) !== 100
  )
    throw new Error("前三名分配比例必須合計 100%");
  return allocatePool(
    total,
    percentages.map((weight, i) => ({ id: String(i + 1), weight })),
  );
}
