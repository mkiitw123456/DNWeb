import { createPublicKey, verify } from "node:crypto";
import { transact } from "./store.js";
import { action, fail } from "./domain.js";
import { DISCORD_API } from "./discord.js";

export function claimFromDiscord(state, interaction, now = Date.now()) {
  const match = /^dnclaim:([\w-]{1,40}):([\w-]{1,40})$/.exec(
    interaction.data?.custom_id || "",
  );
  if (!match) fail("這個按鈕無法使用，請至 DNWeb 結算頁領取。", 400);
  const item = state.settlements.find((s) => s.id === match[1]);
  if (!item || item.discordClaimKey !== match[2])
    fail("這筆結算已刪除或修改，請至 DNWeb 查看最新資料。", 409);
  const message = item.discordMessage;
  if (
    !message ||
    message.id !== interaction.message?.id ||
    message.channelId !== interaction.channel_id ||
    message.guildId !== interaction.guild_id
  )
    fail("通知訊息不符，請從最新的售出通知領取。", 403);
  const discordId = interaction.member?.user?.id;
  if (!discordId) fail("請在公會伺服器內操作。", 403);
  const users = state.users.filter((u) => u.discordId === discordId);
  if (users.length !== 1)
    fail("Discord 帳號尚未正確綁定，請管理員檢查 DNWeb 的 Discord ID。", 403);
  const user = users[0];
  if (!user.active) fail("你的 DNWeb 帳號已停用，請聯絡管理員。", 403);
  const payout = item.payouts.find((p) => p.userId === user.id);
  if (!payout) fail("你不是這筆交易的分帳成員。", 403);
  const alreadyClaimed = Boolean(payout.claimedAt);
  if (!alreadyClaimed) {
    if (payout.discordInteractionId === interaction.id)
      fail("這次操作已處理，請重新按下領取按鈕。", 409);
    action(
      state,
      user,
      "settlement.claim",
      { id: item.id, userId: user.id },
      now,
    );
    payout.discordInteractionId = interaction.id;
  }
  return `${alreadyClaimed ? "這筆款項已領取，無須重複操作" : "已確認領取"}：${payout.amount.toLocaleString("en-US")} 金幣（${item.name}）。${item.completedAt ? "\n全員已領取，結算已移入歷史紀錄。" : ""}`;
}

export async function finishInteraction(interaction) {
  let content;
  try {
    content = await transact((s) => claimFromDiscord(s, interaction));
  } catch (error) {
    content = error.status
      ? error.message
      : "暫時無法確認領取，請稍後重試或至 DNWeb 查看領取狀態。";
  }
  try {
    const response = await fetch(
      `${DISCORD_API}/webhooks/${interaction.application_id}/${encodeURIComponent(interaction.token)}/messages/@original`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok)
      console.error("Discord receipt response failed:", response.status);
  } catch {
    console.error("Discord receipt response unavailable");
  }
}

export function validSignature(raw, headers, publicKey, now = Date.now()) {
  const signature = headers.get("x-signature-ed25519") || "";
  const timestamp = headers.get("x-signature-timestamp") || "";
  if (
    !/^[a-f0-9]{64}$/i.test(publicKey || "") ||
    !/^[a-f0-9]{128}$/i.test(signature) ||
    !/^\d{10,12}$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300
  )
    return false;
  try {
    const key = createPublicKey({
      key: Buffer.concat([
        Buffer.from("302a300506032b6570032100", "hex"),
        Buffer.from(publicKey, "hex"),
      ]),
      format: "der",
      type: "spki",
    });
    return verify(
      null,
      Buffer.concat([Buffer.from(timestamp), raw]),
      key,
      Buffer.from(signature, "hex"),
    );
  } catch {
    return false;
  }
}

export async function handleDiscordRequest(request, schedule) {
  const json = (value, status = 200) =>
    Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
  if (request.method !== "POST")
    return json({ error: "Method not allowed" }, 405);
  if (!process.env.DISCORD_PUBLIC_KEY || !process.env.DISCORD_APPLICATION_ID)
    return json({ error: "Discord is not configured" }, 503);
  const raw = Buffer.from(await request.arrayBuffer());
  if (raw.length > 65536) return json({ error: "Payload too large" }, 413);
  if (!validSignature(raw, request.headers, process.env.DISCORD_PUBLIC_KEY))
    return json({ error: "Invalid signature" }, 401);
  let interaction;
  try {
    interaction = JSON.parse(raw.toString("utf8"));
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (
    !interaction ||
    interaction.application_id !== process.env.DISCORD_APPLICATION_ID
  )
    return json({ error: "Invalid application" }, 403);
  if (interaction.type === 1) return json({ type: 1 });
  if (
    interaction.type !== 3 ||
    interaction.data?.component_type !== 2 ||
    !/^dnclaim:[\w-]{1,40}:[\w-]{1,40}$/.test(interaction.data?.custom_id || "")
  )
    return json({ type: 4, data: { content: "不支援此操作。", flags: 64 } });
  if (
    !process.env.DISCORD_GUILD_ID ||
    interaction.guild_id !== process.env.DISCORD_GUILD_ID ||
    !/^\d{17,20}$/.test(interaction.id || "") ||
    typeof interaction.token !== "string" ||
    !interaction.token
  )
    return json({ error: "Invalid interaction context" }, 403);
  // Acknowledge immediately; Firestore work must not delay Discord's 3-second deadline.
  schedule(finishInteraction(interaction));
  return json({ type: 5, data: { flags: 64 } });
}
