import { transact } from "./store.js";
export async function deliverEvents(ids) {
  await Promise.all(
    ids.map(async (id) => {
      const job = await transact((s) => {
        const event = s.deliveries?.find((e) => e.id === id);
        if (
          !event ||
          event.status === "sent" ||
          (event.status === "sending" && Date.now() - event.attemptAt < 60000)
        )
          return null;
        const url = s.discordWebhooks?.[event.channel];
        event.status = url ? "sending" : "unconfigured";
        event.attemptAt = Date.now();
        const raid = s.raids?.find(
          (r) =>
            r.id === event.raidId &&
            r.revision === event.revision &&
            r.notificationEventId === event.id,
        );
        if (event.channel === "raid" && !raid) {
          event.status = "obsolete";
          return null;
        }
        if (raid) raid.notification = event.status;
        return url ? { url, event: structuredClone(event) } : null;
      });
      if (!job) return;
      let status = "failed";
      try {
        const response = await fetch(job.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(job.event.message),
          redirect: "error",
          signal: AbortSignal.timeout(8000),
        });
        if (response.ok) status = "sent";
      } catch {
        /* Keep failure visible; never log secret URLs. */
      }
      await transact((s) => {
        const event = s.deliveries.find((e) => e.id === id);
        if (!event || event.attemptAt !== job.event.attemptAt) return;
        event.status = status;
        const raid = s.raids?.find(
          (r) =>
            r.id === event.raidId &&
            r.revision === event.revision &&
            r.notificationEventId === event.id,
        );
        if (raid) {
          raid.notification = status;
          if (status === "sent") raid.notifiedAt = Date.now();
        }
      });
    }),
  );
}
