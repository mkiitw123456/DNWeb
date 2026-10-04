export const DISCORD_API = "https://discord.com/api/v10";

export function discordEnabled() {
  return Boolean(
    process.env.DISCORD_BOT_TOKEN &&
    process.env.DISCORD_APPLICATION_ID &&
    process.env.DISCORD_PUBLIC_KEY &&
    process.env.DISCORD_CHANNEL_ID &&
    process.env.DISCORD_GUILD_ID,
  );
}

export function saleMessage(item, users, interactive = false) {
  const mentions = item.payouts
    .map((p) => users.find((u) => u.id === p.userId)?.discordId)
    .filter(Boolean);
  const lines = item.payouts.map((p) => {
    const discord = users.find((u) => u.id === p.userId)?.discordId;
    return `${discord ? `<@${discord}>` : p.username}：${p.amount.toLocaleString("en-US")} 金幣`;
  });
  const retained =
    item.net - item.payouts.reduce((sum, p) => sum + p.amount, 0);
  if (retained > 0)
    lines.push(`餘額 ${retained.toLocaleString("en-US")} 金幣由賣家保留。`);
  const instruction = interactive
    ? "領到款項後，按下方「確認領取」即可登記自己的份額。"
    : "請到 DNWeb 結算分頁確認領取。";
  return {
    content: `【物品已售出】${item.name}\n${lines.join("\n")}\n${instruction}\n結算編號：${item.id}`,
    allowed_mentions: { parse: [], users: mentions },
    ...(interactive
      ? {
          components: [
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 3,
                  label: "確認領取",
                  custom_id: `dnclaim:${item.id}:${item.discordClaimKey}`,
                },
              ],
            },
          ],
        }
      : {}),
  };
}
