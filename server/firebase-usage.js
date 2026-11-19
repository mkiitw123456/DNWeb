import { fail } from "./domain.js";
const zone = "America/Los_Angeles";
export function quotaPeriod(now = Date.now()) {
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    format.formatToParts(now).map((p) => [p.type, p.value]),
  );
  const midnight = Date.UTC(+parts.year, +parts.month - 1, +parts.day);
  function atPacificMidnight(day) {
    for (const offset of [7, 8]) {
      const candidate = day + offset * 3600000;
      if (
        new Intl.DateTimeFormat("en-US", {
          timeZone: zone,
          hour: "2-digit",
          hourCycle: "h23",
        }).format(candidate) === "00"
      )
        return candidate;
    }
    throw new Error("Cannot resolve quota boundary");
  }
  return {
    start: atPacificMidnight(midnight),
    end: atPacificMidnight(midnight + 86400000),
  };
}
const metrics = [
  ["reads", "文件讀取", "read_count", 50000],
  ["writes", "文件寫入", "write_count", 20000],
  ["deletes", "文件刪除", "delete_count", 20000],
];
export async function readUsage(
  project,
  token,
  now = Date.now(),
  fetcher = fetch,
) {
  const period = quotaPeriod(now);
  const rows = await Promise.all(
    metrics.map(async ([id, label, metric, freeQuota]) => {
      const row = { id, label, freeQuota, value: null, latestAt: null };
      let pageToken = "",
        total = 0,
        found = false;
      try {
        for (let page = 0; page < 10; page++) {
          const params = new URLSearchParams({
            filter: `metric.type="firestore.googleapis.com/document/${metric}" AND resource.labels.project_id="${project}"`,
            "interval.startTime": new Date(period.start).toISOString(),
            "interval.endTime": new Date(now).toISOString(),
            "aggregation.alignmentPeriod": "60s",
            "aggregation.perSeriesAligner": "ALIGN_SUM",
            "aggregation.crossSeriesReducer": "REDUCE_SUM",
            view: "FULL",
            pageSize: "10000",
            ...(pageToken ? { pageToken } : {}),
          });
          const response = await fetcher(
            `https://monitoring.googleapis.com/v3/projects/${encodeURIComponent(project)}/timeSeries?${params}`,
            {
              headers: { Authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(8000),
            },
          );
          if (!response.ok) {
            row.status = response.status === 403 ? "permission" : "unavailable";
            const body = await response.json?.().catch(() => null);
            const error = body?.error;
            const reason = error?.details?.find((d) => d.reason)?.reason;
            row.diagnostic = [`HTTP ${response.status}`, reason, error?.message]
              .filter(Boolean).join(" · ").slice(0, 700);
            return row;
          }
          const data = await response.json();
          for (const series of data.timeSeries || [])
            for (const point of series.points || []) {
              const value = Number(
                point.value?.int64Value ?? point.value?.doubleValue,
              );
              const at = Date.parse(point.interval?.endTime);
              if (
                !Number.isFinite(value) ||
                !Number.isFinite(at) ||
                at <= period.start ||
                at > now
              )
                continue;
              total += value;
              found = true;
              row.latestAt = Math.max(row.latestAt || 0, at);
            }
          pageToken = data.nextPageToken || "";
          if (!pageToken)
            return {
              ...row,
              status: found ? "ok" : "no_data",
              value: found ? total : null,
            };
        }
        return { ...row, status: "incomplete" };
      } catch {
        return { ...row, status: "unavailable" };
      }
    }),
  );
  return { project, period, fetchedAt: now, metrics: rows, configured: true };
}
let cache, pending;
export async function firebaseUsage(user, now = Date.now()) {
  if (!user?.admin) fail("僅管理員可查看 Firebase 用量", 403);
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw)
    return {
      configured: false,
      period: quotaPeriod(now),
      metrics: [],
      fetchedAt: now,
    };
  let account;
  try {
    account = JSON.parse(raw);
  } catch {
    fail("Firebase 憑證格式錯誤", 503);
  }
  const project = account.project_id;
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project || ""))
    fail("Firebase 專案 ID 格式錯誤", 503);
  const key = project + ":" + quotaPeriod(now).start;
  if (cache?.key === key && now - cache.at < 60000) return cache.value;
  if (pending?.key === key) return pending.promise;
  const promise = (async () => {
    const { cert } = await import("firebase-admin/app");
    let access_token;
    try {
      ({ access_token } = await cert(account).getAccessToken());
    } catch {
      fail("無法取得監控存取權，請確認正式站 Firebase 服務帳戶設定", 503);
    }
    const value = await readUsage(project, access_token, now);
    value.serviceAccount = account.client_email;
    if (value.metrics.every((m) => ["ok", "no_data"].includes(m.status)))
      cache = { key, at: now, value };
    return value;
  })();
  pending = { key, promise };
  try {
    return await promise;
  } finally {
    if (pending?.promise === promise) pending = null;
  }
}
