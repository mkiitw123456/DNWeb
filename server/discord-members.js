import { fail, text } from "./domain.js";
const API = "https://discord.com/api/v10";
let cache = null,
  loading = null;
export async function verifyDiscordMember(id, fetcher = fetch) {
  if (!/^\d{17,20}$/.test(id || "")) fail("請從搜尋結果選擇 Discord 成員");
  const token = process.env.DISCORD_BOT_TOKEN,
    guild = process.env.DISCORD_GUILD_ID;
  if (!token || !/^\d{17,20}$/.test(guild || ""))
    fail("尚未設定 Discord Bot", 503);
  const response = await fetcher(`${API}/guilds/${guild}/members/${id}`, {
    headers: { Authorization: `Bot ${token}` },
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 404) fail("這位成員已不在 Discord 伺服器中");
  if (!response.ok) fail("Discord 驗證暫時無法使用，請稍後再試", 503);
  const member = await response.json();
  if (member.user?.id !== id || member.user.bot)
    fail("請選擇有效的 Discord 成員");
  return id;
}
async function guildMembers(fetcher, now) {
  const token = process.env.DISCORD_BOT_TOKEN,
    guild = process.env.DISCORD_GUILD_ID;
  if (!token || !/^\d{17,20}$/.test(guild || ""))
    fail("尚未設定 Discord 成員搜尋，請聯絡管理員或稍後再試", 503);
  if (!cache || cache.guild !== guild || now - cache.at > 300000) {
    if (!loading)
      loading = (async () => {
        const members = [];
        let after = "0";
        for (let page = 0; page < 20; page++) {
          const response = await fetcher(
            `${API}/guilds/${guild}/members?limit=1000&after=${after}`,
            {
              headers: { Authorization: `Bot ${token}` },
              signal: AbortSignal.timeout(8000),
            },
          );
          if (!response.ok)
            fail(
              response.status === 429
                ? "Discord 忙碌中，請稍後再試"
                : "無法讀取伺服器成員，請管理員確認 Bot 與 Server Members Intent",
              503,
            );
          const rows = await response.json();
          if (!Array.isArray(rows)) fail("Discord 回應格式錯誤", 502);
          members.push(
            ...rows
              .filter((m) => m.user && !m.user.bot)
              .map((m) => ({
                id: m.user.id,
                username: m.user.username,
                displayName: m.nick || m.user.global_name || m.user.username,
                globalName: m.user.global_name || "",
                guildMember: m.roles?.includes("1559201656636309604") === true,
              })),
          );
          if (rows.length < 1000) {
            cache = { guild, at: now, members };
            return;
          }
          after = rows.at(-1).user.id;
        }
        fail("伺服器成員過多，請聯絡管理員協助設定", 503);
      })().finally(() => {
        loading = null;
      });
    await loading;
  }
  return cache.members;
}

export async function raidGuildOwners(users, fetcher = fetch, now = Date.now()) {
  const linked = users.filter(u => u.active && u.discordId);
  if (!linked.length) return [];
  const ids = new Set((await guildMembers(fetcher, now)).filter(m => m.guildMember).map(m => m.id));
  return linked.filter(u => ids.has(u.discordId)).map(u => u.id);
}

export async function searchDiscordMembers(query, fetcher = fetch, now = Date.now()) {
  const q = text(query, "Discord 名稱", 80).toLocaleLowerCase();
  if (q.length < 2) fail("請至少輸入兩個字元");
  const matches = (await guildMembers(fetcher, now)).filter((m) =>
    [m.username, m.displayName, m.globalName].some((n) =>
      n.toLocaleLowerCase().includes(q),
    ),
  );
  return {
    members: matches.slice(0, 20).map(({ id, username, displayName }) => ({ id, username, displayName })),
    more: matches.length > 20,
  };
}
