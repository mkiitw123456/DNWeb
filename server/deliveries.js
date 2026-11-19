import { transact } from "./store.js";

function currentRaid(s, event) {
  return s.raids?.find(
    (raid) =>
      raid.id === event.raidId &&
      raid.revision === event.revision &&
      raid.notificationEventId === event.id,
  );
}

export async function deliverEvents(ids) {
  if (!ids.length) return;
  const jobs = await transact((s) => claimDeliveries(s, ids));
  await sendClaimedDeliveries(jobs);
}

export function claimDeliveries(s, ids) {
  // Claim the entire batch in one transaction. All deliveries share the
  // guild document, so one concurrent transaction per webhook causes retries.
  const jobs = [];
  for (const id of new Set(ids)) {
    const event = s.deliveries?.find((e) => e.id === id);
    if (
      !event ||
      event.status === "sent" ||
      (event.status === "sending" && Date.now() - event.attemptAt < 60000)
    )
      continue;
    const url = s.discordWebhooks?.[event.channel];
    const raid = currentRaid(s, event);
    event.attemptAt = Date.now();
    if (event.channel === "raid" && !raid) {
      event.status = "obsolete";
      continue;
    }
    event.status = url ? "sending" : "unconfigured";
    if (raid) raid.notification = event.status;
    if (url)
      jobs.push({
        id,
        url,
        message: event.message,
        attemptAt: event.attemptAt,
      });
  }
  return jobs;
}

export async function sendClaimedDeliveries(jobs) {
  if (!jobs.length) return;
  const results = await Promise.all(
    jobs.map(async ({ id, url, message, attemptAt }) => {
      let status = "failed";
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(message),
          redirect: "error",
          signal: AbortSignal.timeout(8000),
        });
        if (response.ok) status = "sent";
      } catch {
        /* Keep failure visible; never log secret URLs. */
      }
      return { id, attemptAt, status };
    }),
  );
  await transact((s) => {
    for (const { id, attemptAt, status } of results) {
      const event = s.deliveries.find((e) => e.id === id);
      if (!event || event.attemptAt !== attemptAt) continue;
      event.status = status;
      const raid = currentRaid(s, event);
      if (raid) {
        raid.notification = status;
        if (status === "sent") raid.notifiedAt = Date.now();
      }
    }
  });
}
