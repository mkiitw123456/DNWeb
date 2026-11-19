import { readFileSync } from "node:fs";
import { Events, PermissionFlagsBits } from "discord.js";

const snowflake = /^\d{17,20}$/;
export function roleMappings(panels) {
  if (!Array.isArray(panels)) throw new Error("設定檔須為訊息清單");
  const result = new Map();
  for (const { channelId, messageId, jobs } of panels) {
    if (![channelId, messageId].every(id => typeof id === "string" && snowflake.test(id)) || !Array.isArray(jobs)) throw new Error("請檢查頻道、訊息 ID 與職業清單");
    for (const { emojiId, roleId } of jobs) {
      if (![emojiId, roleId].every(id => typeof id === "string" && snowflake.test(id))) throw new Error("表情與身分組 ID 必須是數字字串");
      const key = `${channelId}/${messageId}/${emojiId}`;
      if (result.has(key)) throw new Error("同一則訊息的表情不能重複設定");
      result.set(key, { channelId, messageId, emojiId, roleId });
    }
  }
  return result;
}
function assignable(role) {
  return role?.editable && role.id !== role.guild.id && !role.permissions.has(PermissionFlagsBits.Administrator);
}
export function setupReactionRole(client, guildId) {
  let rules;
  try { rules = roleMappings(JSON.parse(readFileSync(new URL("../.local/reaction-roles.json", import.meta.url), "utf8").replace(/^\uFEFF/, ""))); }
  catch (error) { if (error.code !== "ENOENT") console.error("表情身分組設定無效", error.message); return; }
  client.once(Events.ClientReady, async () => {
    const guild = client.guilds.cache.get(guildId);
    for (const rule of rules.values()) {
      try {
        const channel = await guild.channels.fetch(rule.channelId);
        const message = await channel.messages.fetch(rule.messageId);
        if (!assignable(await guild.roles.fetch(rule.roleId))) throw new Error("請確認身分組層級與管理權限");
        await message.react(rule.emojiId);
      } catch (error) { console.error("身分組表情初始化失敗", rule.emojiId, error.message); }
    }
  });
  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot || reaction.message.guildId !== guildId) return;
    const rule = rules.get(`${reaction.message.channelId}/${reaction.message.id}/${reaction.emoji.id}`);
    if (!rule) return;
    try {
      const guild = client.guilds.cache.get(guildId);
      const member = await guild.members.fetch(user.id);
      const role = await guild.roles.fetch(rule.roleId);
      if (!member.user.bot && assignable(role)) await member.roles.add(role, "自選職業身分組");
    } catch (error) { console.error("職業身分組發放失敗", error.message); }
  });
}
