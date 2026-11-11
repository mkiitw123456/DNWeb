export const emojiNamePattern = /^:([A-Za-z0-9_]{2,32}):$/;
export async function fetchGuildEmojis(guildId) {
  if (!/^\d{17,20}$/.test(guildId || "") || !process.env.DISCORD_BOT_TOKEN)
    throw Object.assign(
      new Error("請先將 DNWeb 結算助手加入放置職業貼圖的伺服器"),
      { status: 400 },
    );
  let response;
  try {
    response = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/emojis`,
      {
        headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
        signal: AbortSignal.timeout(8000),
      },
    );
  } catch {
    throw Object.assign(new Error("Discord 暫時無法連線，請稍後再試"), {
      status: 502,
    });
  }
  if (!response.ok)
    throw Object.assign(
      new Error(
        [403, 404].includes(response.status)
          ? "機器人尚未加入職業貼圖所在的伺服器，請先加入後重試"
          : "無法讀取 Discord 表情符號，請稍後再試",
      ),
      { status: 400 },
    );
  const emojis = await response.json();
  return emojis
    .filter(
      (e) =>
        e.available !== false &&
        /^\d{17,20}$/.test(e.id) &&
        /^[A-Za-z0-9_]{2,32}$/.test(e.name),
    )
    .map((e) => ({ id: e.id, name: e.name, animated: !!e.animated }));
}
