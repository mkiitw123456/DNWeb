export const taipeiDay = (value = Date.now()) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
export const taipeiTime = (value) =>
  new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(value);
export const dateInput = (value) => `${taipeiDay(value)}T${taipeiTime(value)}`;
export function nextSevenDays(now = Date.now()) {
  const start = Date.parse(taipeiDay(now) + "T00:00:00+08:00");
  return Array.from({ length: 7 }, (_, i) => taipeiDay(start + i * 86400000));
}
export const mine = (raid, userId) =>
  raid.slots.some((x) => x?.ownerId === userId);
export function searchRoster(roster, users, query, professionId) {
  const q = query.trim().toLocaleLowerCase();
  return users
    .filter((u) => u.active)
    .map((u) => ({
      ...u,
      characters: roster.filter(
        (c) =>
          c.ownerId === u.id &&
          (!professionId || c.professionId === professionId) &&
          (!q ||
            u.username.toLocaleLowerCase().includes(q) ||
            c.name.toLocaleLowerCase().includes(q)),
      ),
    }))
    .filter((u) => u.characters.length);
}
