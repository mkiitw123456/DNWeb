import { useEffect, useState } from "react";
import { RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "./ui.jsx";
const date = (n) =>
  new Date(n).toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    hour12: false,
  });
const messages = {
  billing: "Google 要求這個專案啟用帳單才能透過 API 查詢用量。你可以使用下方的 Firebase 官方用量頁。",
  permission: "權限不足或 Monitoring API 尚未啟用",
  unavailable: "暫時無法取得資料",
  no_data: "此時段尚無監控資料",
  incomplete: "監控資料不完整，請至控制台確認",
};
export default function FirebaseUsage({ request, onUnauthorized }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      setData(await request("firebase.usage"));
    } catch (e) {
      setError(e.message);
      if (e.status === 401) onUnauthorized();
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    refresh();
  }, [request]);
  return (
    <section className="firebase-usage">
      <div className="section-title">
        <div>
          <h2>Firebase 用量</h2>
          <p className="muted">Cloud Firestore · 今日文件操作</p>
        </div>
        <Button disabled={busy} onClick={refresh}>
          <RefreshCw size={16} />
          {busy ? "讀取中…" : "更新用量"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {data && (
        <>
          <p>
            統計區間（台灣時間）：{date(data.period.start)} 起<br />
            下一次免費額度重置：約 {date(data.period.end)}
          </p>
          {!data.configured ? (
            <p className="usage-help">
              目前使用本機資料，未設定 Firebase
              服務帳戶。部署至正式站後會沿用正式站憑證查詢。
            </p>
          ) : (
            <>
              <div className="usage-grid">
                {data.metrics.map((m) => (
                  <article key={m.id}>
                    <small>{m.label}</small>
                    <strong>
                      {m.value === null ? "—" : m.value.toLocaleString("zh-TW")}
                    </strong>
                    <span>
                      每日免費額度參考：{m.freeQuota.toLocaleString("zh-TW")}
                    </span>
                    {m.value !== null ? (
                      <>
                        <progress
                          aria-label={`${m.label}免費額度比例`}
                          value={m.value}
                          max={m.freeQuota}
                        />
                        <small>
                          {Math.round((m.value / m.freeQuota) * 100)}% ·{" "}
                          {m.latestAt ? `最新樣本 ${date(m.latestAt)}` : ""}
                        </small>
                      </>
                    ) : (
                      <div>
                        <p>{messages[m.status]}</p>
                        {m.diagnostic && (
                          <details><summary>Google 回應詳情</summary><small>{m.diagnostic}</small></details>
                        )}
                      </div>
                    )}
                  </article>
                ))}
              </div>
              {data.metrics.some((m) => m.status === "permission") && (
                <div className="usage-help">
                  <strong>需要一次性設定</strong>
                  <ol>
                    <li>在此 Firebase 專案啟用 Cloud Monitoring API。</li>
                    <li>
                      將正式站服務帳戶 <code>{data.serviceAccount}</code> 加入「Monitoring
                      Viewer」（roles/monitoring.viewer）角色。
                    </li>
                    <li>等待權限生效，再按「更新用量」。</li>
                  </ol>
                  <a
                    target="_blank"
                    rel="noopener noreferrer"
                    href={`https://console.cloud.google.com/apis/library/monitoring.googleapis.com?project=${data.project}`}
                  >
                    開啟 API 設定 <ExternalLink size={14} />
                  </a>
                  {" · "}
                  <a
                    target="_blank"
                    rel="noopener noreferrer"
                    href={`https://console.cloud.google.com/iam-admin/iam?project=${data.project}`}
                  >
                    開啟 IAM 權限
                  </a>
                </div>
              )}
              <a
                target="_blank"
                rel="noopener noreferrer"
                href={`https://console.firebase.google.com/project/${data.project}/firestore/usage`}
              >
                前往 Firebase 官方用量頁 <ExternalLink size={14} />
              </a>
            </>
          )}
          <div className="usage-help">
            <strong>怎麼看這些數字？</strong>
            <p>
              這是整個專案的監控統計，可能延遲數分鐘，與最終計費數字可能不同。免費額度只適用一個符合資格的資料庫，這裡的比例不是帳單或停用門檻。
            </p>
            <p>
              讀取／寫入／刪除的每日免費額度在太平洋時間午夜附近重置；儲存空間不會重置，網路傳出免費額度按月計算。本頁不將操作次數當成網路流量或容量。
            </p>
            <p>
              本頁僅開啟或手動更新時查詢，伺服器會短暫快取，不把監控紀錄寫入
              Firebase。
            </p>
          </div>
        </>
      )}
    </section>
  );
}
