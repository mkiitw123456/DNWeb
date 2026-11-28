import { activateLicense, manageLicenses } from "./licenses.js";
import { competitionRequest } from "./competition-store.js";
import { casinoAction, settleCasino } from "./casino.js";
import { gameAction } from "./guild-games.js";
import { duelAction, advanceDuels } from "./duels.js";
import { voiceView } from "./voice-tracking.js";
import { firebaseUsage } from "./firebase-usage.js";
import {
  cleanupDeploymentTest,
  drainUserDeletions,
  compactActivityHistory,
} from "./activity-maintenance.js";
import {
  searchDiscordMembers,
  raidGuildOwners,
  verifyDiscordMember,
} from "./discord-members.js";
import { waitUntil } from "@vercel/functions";
import { activityAction, activityView } from "./activities.js";
import { emojiNamePattern, fetchGuildEmojis } from "./emojis.js";
import { audit } from "./scheduling.js";
import { claimDeliveries, sendClaimedDeliveries } from "./deliveries.js";
import { createHmac, timingSafeEqual } from "node:crypto";
import { pgTransaction, usePostgres } from "./postgres.js";
import { saveCharacterFields } from "./postgres-character.js";
import { guildPanel, linkedGuildUsers, saveRaidSeat } from "./postgres-raids.js";
import { readState, transact } from "./store.js";
import { findEditorCreate, rememberEditorCreate } from "./editor-creates.js";
import {
  action,
  fail,
  id,
  matches,
  publicState,
  register,
  reset,
} from "./domain.js";
import { DISCORD_API, discordEnabled, saleMessage } from "./discord.js";
// Renew the browser cookie on activity; persistent sessions have no server expiry.
const SESSION_SECONDS = 400 * 24 * 60 * 60;
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
    return data.persistent === true || data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}
function cookie(res, user) {
  const value = Buffer.from(
    JSON.stringify({
      id: user.id,
      version: user.version,
      persistent: true,
    }),
  ).toString("base64url");
  res.setHeader(
    "Set-Cookie",
    `dn_session=${value}.${signature(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${process.env.VERCEL ? "; Secure" : ""}`,
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
function background(job) {
  const safe = job.catch((e) =>
    console.error("Background maintenance failed", e.message),
  );
  if (process.env.VERCEL) waitUntil(safe);
}
function auditJobs(s, user, type, payload) {
  s.deliveries ??= [];
  const previous = new Set(s.deliveries.map((e) => e.id));
  audit(s, user, type, payload);
  return claimDeliveries(
    s,
    s.deliveries.filter((e) => !previous.has(e.id)).map((e) => e.id),
  );
}
function pendingCasinoJobs(s) {
  return claimDeliveries(
    s,
    (s.deliveries || [])
      .filter((e) => e.channel === "casino" && e.status === "pending")
      .map((e) => e.id),
  );
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
    if (process.env.VERCEL && ["state", "activity.state", "activity.summary", "competition.room", "competition.state"].includes(type))
      console.info("db_usage request", type, req.url?.includes("bootstrap=1") ? "bootstrap" : "");
    if (type === "license.activate") return res.status(200).json(await transact(s => activateLicense(s, payload)));
    await cleanupDeploymentTest();
    if (type === "logout") {
      const token = session(req);
      if (token) {
        const jobs = await transact((s) => {
          const u = s.users.find(
            (x) => x.id === token.id && x.active && x.version === token.version,
          );
          if (!u) return [];
          return auditJobs(s, u, "logout", {});
        });
        background(sendClaimedDeliveries(jobs));
      }

      res.setHeader(
        "Set-Cookie",
        "dn_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
      );
      return res.status(200).json({ ok: true });
    }
    if (type === "register") {
      if (!process.env.SESSION_SECRET) fail("請設定 SESSION_SECRET", 503);
      const result = await transact((s) => {
        const user = register(s, payload);
        reset(s);
        const jobs = auditJobs(s, user, "register", {
          username: user.username,
        });
        return {
          user,
          state: publicState(s, user),
          jobs,
          members: s.users.map(({ id, username, nickname, active }) => ({
            id,
            username,
            nickname,
            active,
          })),
        };
      });
      background(sendClaimedDeliveries(result.jobs));
      result.state.activity = await activityView(result.user, result.members);
      cookie(res, result.user);
      return res.status(200).json(result.state);
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
        return {
          jobs: auditJobs(s, u, "login", {}),
          user: u,
          state: publicState(s, u),
          members: s.users.map(({ id, username, nickname, active }) => ({
            id,
            username,
            nickname,
            active,
          })),
        };
      });
      if (!result) fail("帳號或密碼錯誤", 401);
      background(sendClaimedDeliveries(result.jobs));
      result.state.activity = await activityView(result.user, result.members);
      cookie(res, result.user);
      return res.status(200).json(result.state);
    }
    const token = session(req);
    if (!token) fail("請先登入", 401);
    if (type.startsWith("license.")) {
      const store = type === "license.list" ? readState : transact;
      return res.status(200).json(await store(s => manageLicenses(s, token, type, payload)));
    }
    if (usePostgres() && type === "raid.guildMembers.state") {
      const users = await pgTransaction(c => linkedGuildUsers(c, token));
      return res.status(200).json({owners:await raidGuildOwners(users)});
    }
    if (usePostgres() && type === "guildPanel.state")
      return res.status(200).json(await pgTransaction(c => guildPanel(c, token, payload.page)));
    if (usePostgres() && (type === "character.quickSave" ||
        (type === "character.save" && payload.id && payload.partial === true) ||
        (type === "raid.seat" && payload.partial === true) ||
        (type === "character.gear" && Object.hasOwn(payload, "gear")))) {
      const saved = await pgTransaction(c => type === "raid.seat" ? saveRaidSeat(c, token, payload)
        : saveCharacterFields(c, token, type, payload));
      if (saved) {
        background(sendClaimedDeliveries(saved.jobs));
        cookie(res, saved.user);
        return res.status(200).json(saved.state);
      }
    }
    if (type.startsWith("competition.")) {
      const { view, jobs } = await competitionRequest(token, type, payload);
      if (jobs.length) background(sendClaimedDeliveries(jobs));
      return res.status(200).json(view);
    }
    if (
      type.startsWith("casino.") ||
      type.startsWith("game.") ||
      type.startsWith("duel.")
    ) {
      const result = await transact((s) => {
        const user = s.users.find(
          (x) => x.id === token.id && x.active && x.version === token.version,
        );
        if (!user) fail("登入已過期，請重新登入", 401);
        const state = type.startsWith("duel.")
          ? duelAction(s, user, type, payload)
          : type.startsWith("game.")
            ? gameAction(s, user, type, payload)
            : casinoAction(s, user, type, payload);
        return { state, jobs: pendingCasinoJobs(s), user };
      });
      background(sendClaimedDeliveries(result.jobs));
      if (type === "duel.accept") {
        const endsAt = result.state.rooms.find(
          (r) => r.id === payload.id,
        )?.endsAt;
        if (endsAt)
          background(
            (async () => {
              await new Promise((resolve) =>
                setTimeout(resolve, Math.max(0, endsAt - Date.now()) + 100),
              );
              const jobs = await transact((s) => {
                advanceDuels(s);
                return pendingCasinoJobs(s);
              });
              await sendClaimedDeliveries(jobs);
            })(),
          );
      }
      cookie(res, result.user);
      return res.status(200).json(result.state);
    }
    if (
      type.startsWith("activity.") ||
      type === "aquarium.checkIn" ||
      type === "voice.state" ||
      type === "firebase.usage" ||
      type === "discord.members" ||
      type === "raid.guildMembers.state" ||
      type === "maintenance.retryDeletions"
    ) {
      const auth = await readState((s) => {
        const user = s.users.find(
          (x) => x.id === token.id && x.active && x.version === token.version,
        );
        if (!user) fail("登入已過期，請重新登入", 401);
        return {
          user,
          users: s.users.map(
            ({ id, username, nickname, active, discordId }) => ({
              id,
              username,
              nickname,
              active,
              discordId: discordId || "",
            }),
          ),
        };
      });
      if (type === "voice.state")
        return res.status(200).json(await voiceView(auth.user, auth.users));
      if (type === "firebase.usage")
        return res.status(200).json(await firebaseUsage(auth.user));
      if (type === "maintenance.retryDeletions") {
        if (!auth.user.admin) fail("僅管理員可操作", 403);
        await drainUserDeletions();
        return res.status(200).json({ ok: true });
      }
      if (type === "discord.members")
        return res.status(200).json(await searchDiscordMembers(payload.query));
      if (type === "raid.guildMembers.state")
        return res.status(200).json({ owners: await raidGuildOwners(auth.users) });
      const audited = [
        "activity.submit",
        "activity.adjust",
        "activity.config",
        "activity.profile",
      ].includes(type);
      const queueAudit = (s) => auditJobs(s, auth.user, type, payload);
      const response = await activityAction(
        auth.user,
        auth.users,
        type,
        payload,
        Date.now(),
        audited ? queueAudit : undefined,
      );
      if (audited) background(sendClaimedDeliveries(response.jobs));
      cookie(res, auth.user);
      return res.status(200).json(audited ? response.result : response);
    }
    let verifiedDiscordId = null;
    if (type === "profile.discordRequest") {
      await readState((s) => {
        if (
          !s.users.some(
            (x) => x.id === token.id && x.active && x.version === token.version,
          )
        )
          fail("請先登入", 401);
      });
      verifiedDiscordId = await verifyDiscordMember(payload.discordId);
    }
    let emojiCatalog = null;
    if (
      type === "profession.save" &&
      typeof payload.discordEmoji === "string" &&
      emojiNamePattern.test(payload.discordEmoji.trim())
    ) {
      const guildId = await readState((s) => {
        const user = s.users.find(
          (x) => x.id === token.id && x.active && x.version === token.version,
        );
        if (!user) fail("登入已過期，請重新登入", 401);
        if (!user.admin) fail("僅管理員可操作", 403);
        if (findEditorCreate(s, user, type, payload)) return null;
        return s.discordEmojiGuildId || process.env.DISCORD_GUILD_ID;
      });
      if (guildId !== null) emojiCatalog = await fetchGuildEmojis(guildId);
    }
    const result = await transact(
      (s) => {
        const u = s.users.find(
          (x) => x.id === token.id && x.active && x.version === token.version,
        );
        if (!u) fail("登入已過期，請重新登入", 401);
        reset(s);
        if (type === "state") {
          settleCasino(s);
          advanceDuels(s);
          const casinoJobs = pendingCasinoJobs(s);
          return {
            state: publicState(s, u),
            user: { ...u },
            pendingDeletions: !!s.pendingUserDeletions?.length,
            jobs: casinoJobs,
            members: s.users.map(({ id, username, nickname, active }) => ({
              id,
              username,
              nickname,
              active,
            })),
          };
        }
        const replay = findEditorCreate(s, u, type, payload);
        if (replay) return { state: replay, user: { ...u }, jobs: [] };
        const previousEvents = new Set(s.deliveries.map((e) => e.id));
        if (emojiCatalog) s.discordEmojis = emojiCatalog;
        const result = action(s, u, type, payload, Date.now(), {
          verifiedDiscordId,
        });
        audit(s, u, type, payload);
        const eventIds = s.deliveries
          .filter((e) => !previousEvents.has(e.id))
          .map((e) => e.id);
        if (type === "delivery.retry") eventIds.push(payload.id);
        const jobs = claimDeliveries(s, eventIds);
        if (!s.users.some((x) => x.id === u.id))
          return { state: null, user: null, jobs };
        const state =
          type === "character.quickSave" ||
          (type === "character.gear" && result)
            ? result
            : publicState(s, u);
        if (
          !payload.id &&
          type.endsWith(".save") &&
          typeof result === "string"
        ) {
          state.savedRecordId = result;
          rememberEditorCreate(s, u, type, payload, result);
        }
        return {
          state,
          user: { ...u },
          jobs,
          requestedDelivery:
            type === "delivery.retry"
              ? payload.id
              : type === "raid.notify"
                ? s.raids.find((r) => r.id === payload.id)?.notificationEventId
                : null,
          notificationId: ["listing.sell", "notification.retry"].includes(type)
            ? result
            : null,
        };
      },
      { backup: type === "maintenance.cleanup" },
    );
    if (type === "state") {
      if (result.pendingDeletions) background(drainUserDeletions());
      background(compactActivityHistory());
    }
    // The outbox and its claims are committed with the edit. Network delivery
    // happens afterwards; only explicit notification commands await its result.
    const jobs = result.jobs || [];
    const requestedJob = jobs.find(
      (job) => job.id === result.requestedDelivery,
    );
    background(
      sendClaimedDeliveries(jobs.filter((job) => job !== requestedJob)),
    );
    if (type === "user.delete") await drainUserDeletions();
    if (requestedJob || result.notificationId || type === "user.delete") {
      if (requestedJob) await sendClaimedDeliveries([requestedJob]);
      if (result.notificationId) await notify(result.notificationId);
      result.state = await readState((s) => {
        const user = s.users.find(
          (u) => u.id === token.id && u.active && u.version === token.version,
        );
        if (!user) fail("登入已過期，請重新登入", 401);
        return publicState(s, user);
      });
    }
    if (type === "state" && req.url?.includes("bootstrap=1"))
      result.state.activity = await activityView(result.user, result.members);
    if (result.user) cookie(res, result.user);
    else
      res.setHeader(
        "Set-Cookie",
        "dn_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
      );
    return res.status(200).json(result.state);
  } catch (e) {
    if (!e.status) console.error(e);
    return res
      .status(e.status || 500)
      .json({ error: e.status ? e.message : "伺服器發生錯誤，請稍後再試" });
  }
}
