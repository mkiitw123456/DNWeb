import { useEffect, useState } from "react";
import { Button, Field } from "./ui.jsx";
const duration = (ms) =>
  `${Math.floor(ms / 3600000)} 小時 ${Math.floor(ms / 60000) % 60} 分 ${Math.floor(ms / 1000) % 60} 秒`;
export default function VoiceStats({ request, onUnauthorized }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true,
      pending = false;
    async function refresh() {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const r = await request("voice.state");
        if (live) {
          setData(r);
          setError("");
        }
      } catch (e) {
        if (live) {
          setError(e.message);
          if (e.status === 401) onUnauthorized();
        }
      } finally {
        pending = false;
      }
    }
    refresh();
    return () => {
      live = false;
    };
  }, [request, onUnauthorized, revision]);
  return (
    <section className="admin-panel">
      <div className="section-title">
        <h2>語音時間與文字發言</h2>
        <Button onClick={() => setRevision((n) => n + 1)}>重新整理</Button>
      </div>
      <p className="hint">
        語音時間累計已暫停。Bot 有收到新發言時才會同步文字統計。
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p role="status">
        發言同步：
        {!data ? "讀取中…" : data.lastSeen ? "已收到資料" : "等待新發言"}
        {data?.lastSeen &&
          ` · 上次同步 ${new Date(data.lastSeen).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false })}`}
      </p>
      <p className="muted">
        以下顯示已綁定 Discord
        的啟用會員。
      </p>
      <Field
        label="搜尋會員"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="game-entry-list">
        {data?.rows
          .filter((r) => r.name.toLowerCase().includes(query.toLowerCase()))
          .sort((a, b) => b.todayMs - a.todayMs)
          .map((r) => (
            <div key={r.id}>
              <span>
                <strong>{r.name}</strong>
                <small>{r.counting ? "正在累積有效時間" : "未計時"}</small>
              </span>
              <span>
                今日 {duration(r.todayMs)}
                <small>累積 {duration(r.totalMs)}</small>
                <small>累積發言 {r.messages || 0} 則</small>
              </span>
            </div>
          ))}
      </div>
      {data && !data.rows.length && <p>目前沒有已綁定 Discord 的會員。</p>}
    </section>
  );
}
