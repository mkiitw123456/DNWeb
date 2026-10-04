import { createHmac, timingSafeEqual } from "node:crypto";
import { transact } from "./store.js";
import { action, fail, id, matches, publicState, reset } from "./domain.js";
import { DISCORD_API, discordEnabled, saleMessage } from "./discord.js";
function signature(value) {
  if (!process.env.SESSION_SECRET) fail("請設定 SESSION_SECRET", 503);
  return createHmac("sha256", process.env.SESSION_SECRET)
    .update(value)
    .digest("base64url");
}
function session(req) {
  const raw = (req.headers.cookie || "")
    .split("; ")
    .find((x) => x.startsWith("dn_session="))
    ?.slice(11);
  if (!raw) return null;
  const [value, sig] = raw.split(".");
  const expected = signature(value);
  if (
    !sig ||
    sig.length !== expected.length ||
    !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  )
    return null;
  try {
    const data = JSON.parse(Buffer.from(value, "base64url"));
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}
function cookie(res, user) {
  const value = Buffer.from(
    JSON.stringify({
      id: user.id,
      version: user.version,
      exp: Date.now() + 7 * 86400000,
    }),
  ).toString("base64url");
  res.setHeader(
    "Set-Cookie",
    `dn_session=${value}.${signature(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${process.env.VERCEL ? "; Secure" : ""}`,
  );
}
export async function notify(settlementId) {
  const notification = await transact((s) => {
    const item = s.settlements.find((x) => x.id === settlementId);
    if (
      !item ||
      item.notification === "sent" ||
      (item.notification === "sending" &&
        Date.now() - (item.notificationAt || 0) < 60000)
    )
      return null;
    const interactive = discordEnabled();
    const url = interactive
      ? `${DISCORD_API}/channels/${process.env.DISCORD_CHANNEL_ID}/messages`
      : s.webhook || process.env.DISCORD_WEBHOOK_URL;
    if (!url) {
      item.notification = "unconfigured";
      return null;
    }
    item.notification = "sending";
    item.notificationAt = Date.now();
    if (interactive) item.discordClaimKey ||= id();
    return {
      url,
      interactive,
      item: structuredClone(item),
      users: s.users.map((x) => ({ id: x.id, discordId: x.discordId })),
    };
  });
  if (!notification) return;
  const { url, item, users, interactive } = notification;
  let status = "failed";
  let discordMessage = null;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(interactive
          ? { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({
        ...saleMessage(item, users, interactive),
        ...(interactive
          ? {
              nonce: item.discordClaimKey.replaceAll("-", "").slice(0, 25),
              enforce_nonce: true,
            }
          : {}),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok) {
      if (interactive) {
        const message = await response.json();
        if (!/^\d{17,20}$/.test(message.id))
          throw new Error("Invalid Discord message");
        discordMessage = {
          id: message.id,
          channelId: process.env.DISCORD_CHANNEL_ID,
          guildId: process.env.DISCORD_GUILD_ID,
        };
      }
      status = "sent";
    }
  } catch {
    /* Persist failure for explicit retry. */
  }
  await transact((s) => {
    const current = s.settlements.find((x) => x.id === settlementId);
    if (current && current.discordClaimKey === item.discordClaimKey) {
      current.notification = status;
      current.notificationAt = Date.now();
      if (discordMessage) current.discordMessage = discordMessage;
    }
  });
}
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  try {
    if (!["GET", "POST"].includes(req.method)) fail("Method not allowed", 405);
    if (req.method === "POST" && req.headers.origin) {
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      if (new URL(req.headers.origin).host !== host)
        fail("不允許跨站操作", 403);
    }
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const type = req.method === "GET" ? "state" : body.type;
    const payload = body.payload || {};
    if (type === "logout") {
      res.setHeader(
        "Set-Cookie",
        "dn_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
      );
      return res.status(200).json({ ok: true });
    }
    if (type === "login") {
      if (
        typeof payload.username !== "string" ||
        typeof payload.password !== "string" ||
        payload.password.length > 128
      )
        fail("帳號或密碼錯誤", 401);
      const result = await transact((s) => {
        const u = s.users.find(
          (x) =>
            x.username.toLowerCase() ===
              payload.username.trim().toLowerCase() && x.active,
        );
        if (!u || !matches(payload.password, u.password)) return null;
        reset(s);
        return { user: u, state: publicState(s, u) };
      });
      if (!result) fail("帳號或密碼錯誤", 401);
      cookie(res, result.user);
      return res.status(200).json(result.state);
    }
    const token = session(req);
    if (!token) fail("請先登入", 401);
    const result = await transact((s) => {
      const u = s.users.find(
        (x) => x.id === token.id && x.active && x.version === token.version,
      );
      if (!u) fail("登入已過期，請重新登入", 401);
      reset(s);
      if (type === "state") return { state: publicState(s, u) };
      const result = action(s, u, type, payload);
      return {
        state: publicState(s, u),
        notificationId: ["listing.sell", "notification.retry"].includes(type)
          ? result
          : null,
      };
    });
    if (result.notificationId) {
      await notify(result.notificationId);
      result.state = await transact((s) =>
        publicState(
          s,
          s.users.find((x) => x.id === token.id),
        ),
      );
    }
    return res.status(200).json(result.state);
  } catch (e) {
    if (!e.status) console.error(e);
    return res
      .status(e.status || 500)
      .json({ error: e.status ? e.message : "伺服器發生錯誤，請稍後再試" });
  }
}
