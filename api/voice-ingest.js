import { createHmac, timingSafeEqual } from "node:crypto";
import { recordVoiceSnapshot } from "../server/voice-tracking.js";
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });
  const stamp = req.headers["x-ddstar-timestamp"],
    actual = req.headers["x-ddstar-signature"];
  const secret = process.env.DISCORD_BOT_TOKEN;
  if (
    !secret ||
    typeof stamp !== "string" ||
    !Number.isFinite(Number(stamp)) ||
    Math.abs(Date.now() - Number(stamp)) > 60000 ||
    typeof actual !== "string" ||
    !/^[a-f0-9]{64}$/.test(actual)
  )
    return res.status(401).json({ error: "Unauthorized" });
  const body = JSON.stringify(req.body);
  if (!body || Buffer.byteLength(body) > 64000)
    return res.status(400).json({ error: "Invalid body" });
  const expected = createHmac("sha256", secret)
    .update(stamp + "." + body)
    .digest("hex");
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(actual)))
    return res.status(401).json({ error: "Unauthorized" });
  if (req.body.guildId !== process.env.DISCORD_GUILD_ID)
    return res.status(403).json({ error: "Wrong guild" });
  try {
    return res.status(200).json(await recordVoiceSnapshot(req.body));
  } catch (e) {
    return res
      .status(e.status || 500)
      .json({ error: e.status ? e.message : "語音統計暫時無法儲存" });
  }
}
