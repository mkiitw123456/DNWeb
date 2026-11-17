import { timingSafeEqual } from "node:crypto";
import { settleCasino } from "../server/casino.js";
import { transact } from "../server/store.js";
import { deliverEvents } from "../server/deliveries.js";
// Optional external scheduler: GET once a minute with Authorization: Bearer CRON_SECRET.
// Never expose the secret to the browser. Public pages also settle overdue rooms.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const expected = process.env.CRON_SECRET
    ? "Bearer " + process.env.CRON_SECRET
    : "";
  const actual = req.headers.authorization || "";
  if (
    !expected ||
    Buffer.byteLength(expected) !== Buffer.byteLength(actual) ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
  )
    return res.status(401).json({ error: "Unauthorized" });
  if (req.method !== "GET") return res.status(405).end();
  const ids = await transact((s) => {
    settleCasino(s);
    return s.deliveries
      .filter((e) => e.channel === "casino" && e.status === "pending")
      .map((e) => e.id);
  });
  await deliverEvents(ids);
  return res.status(200).json({ ok: true });
}
