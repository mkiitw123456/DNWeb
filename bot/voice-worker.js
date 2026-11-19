import dotenv from "dotenv";
import { setupReactionRole } from "./reaction-role.js";
import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { createHmac, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
dotenv.config({ path: path.join(root, ".env"), quiet: true });
const token = process.env.DISCORD_BOT_TOKEN,
  guildId = process.env.DISCORD_GUILD_ID;
const base = new URL(
  process.env.DDSTAR_SITE_URL || "https://dn-web-roan.vercel.app",
);
if (!token || !/^\d{17,20}$/.test(guildId || ""))
  throw new Error("請在 .env 設定 DISCORD_BOT_TOKEN 與 DISCORD_GUILD_ID");
if (
  base.protocol !== "https:" &&
  !["127.0.0.1", "localhost"].includes(base.hostname)
)
  throw new Error("網站網址必須使用 HTTPS");
await mkdir(path.join(root, ".local"), { recursive: true });
const lockPath = path.join(root, ".local", "voice-worker.pid");
async function acquireLock() {
  try {
    const f = await open(lockPath, "wx");
    await f.writeFile(String(process.pid));
    await f.close();
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    const pid = Number(await readFile(lockPath, "utf8"));
    let alive = false;
    if (Number.isSafeInteger(pid) && pid > 0) {
      try {
        process.kill(pid, 0);
        alive = true;
      } catch (err) {
        if (err.code !== "ESRCH") throw err;
      }
    }
    if (alive) throw new Error("語音 Bot 已在執行，請勿重複啟動");
    await unlink(lockPath);
    await acquireLock();
  }
}
await acquireLock();
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User],
});
let sessionId = randomUUID(),
  sequence = 0,
  chain = Promise.resolve(),
  ready = false,
  stopping = false;
// Session totals survive failed uploads. The server applies only the increase.
const textCounts = new Map();
const textSession = randomUUID();
setupReactionRole(client, guildId);
client.on(Events.MessageCreate, message => {
  if (message.guildId !== guildId || message.author.bot || message.webhookId || message.system) return;
  const id = message.author.id;
  if (textCounts.has(id) || textCounts.size < 500) textCounts.set(id, (textCounts.get(id) || 0) + 1);
});
function snapshot() {
  const guild = client.guilds.cache.get(guildId);
  return {
    guildId,
    sessionId,
    sequence: ++sequence,
    textSession, textCounts: Object.fromEntries(textCounts),
    observedAt: Date.now(),
    afkChannelId: guild?.afkChannelId || null,
    members:
      ready && guild
        ? Array.from(guild.voiceStates.cache.values())
            .filter((v) => v.channelId && v.member)
            .map((v) => ({
              id: v.id,
              channelId: v.channelId,
              bot: v.member.user.bot,
            }))
        : [],
  };
}
function send() {
  const data = snapshot();
  chain = chain
    .then(async () => {
      if (Date.now() - data.observedAt > 15000) return;
      const body = JSON.stringify(data),
        stamp = String(Date.now()),
        signature = createHmac("sha256", token)
          .update(stamp + "." + body)
          .digest("hex");
      const res = await fetch(new URL("/api/voice-ingest", base), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ddstar-timestamp": stamp,
          "x-ddstar-signature": signature,
        },
        body,
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      });
      if (!res.ok) throw new Error(`網站回報失敗 HTTP ${res.status}`);
      const receipt = await res.json();
      if (Number.isFinite(receipt.totalMessages)) console.log(`已寫入網站：累積文字發言 ${receipt.totalMessages} 則`);
      if (!receipt.ok || !Number.isFinite(receipt.totalRecordedMs))
        throw new Error("網站未回傳有效的統計收據");
      console.log(
        new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }),
        `已同步 ${data.members.filter((m) => !m.bot).length} 位語音成員（只記時間）；伺服器累積 ${receipt.trackedMembers} 人／${Math.floor(receipt.totalRecordedMs / 1000)} 秒`,
      );
    })
    .catch((e) => {
      console.error(
        e.name === "TimeoutError" ? "網站回報逾時，下次重新同步" : e.message,
      );
    });
  return chain;
}
client.on(Events.ClientReady, () => {
  ready = true;
  sessionId = randomUUID();
  sequence = 0;
  if (!client.guilds.cache.has(guildId)) {
    console.error("Bot 不在指定伺服器內");
    void stop(1);
    return;
  }
  void send();
});
client.on(Events.VoiceStateUpdate, (before, after) => {
  if (after.guild.id === guildId && ready) void send();
});
client.on(Events.ShardDisconnect, () => {
  ready = false;
  void send();
});
client.on(Events.ShardReconnecting, () => {
  ready = false;
});
client.on(Events.ShardResume, () => {
  ready = true;
  sessionId = randomUUID();
  sequence = 0;
  void send();
});
client.on(Events.Error, (e) => console.error("Discord 連線錯誤：", e.name));
const timer = setInterval(() => {
  if (ready) void send();
}, 30000);
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  ready = false;
  await send();
  client.destroy();
  await unlink(lockPath).catch(() => {});
  process.exit(code);
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
try {
  await client.login(token);
} catch (e) {
  console.error("Bot 登入失敗，請核對 Token 與伺服器設定。", e.name);
  await stop(1);
}
