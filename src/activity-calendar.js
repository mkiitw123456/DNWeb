export function matchesContent(value, query) {
  const normalize = (x) =>
    String(x || "")
      .normalize("NFKC")
      .toLocaleLowerCase();
  return normalize(value).includes(normalize(query).trim());
}
export function monthCells(month) {
  const [year, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, m - 1, 1)),
    count = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return [
    ...Array((start.getUTCDay() + 6) % 7).fill(null),
    ...Array.from(
      { length: count },
      (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
    ),
  ];
}
export function shiftMonth(month, delta) {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m - 1 + delta, 1)).toISOString().slice(0, 7);
}
