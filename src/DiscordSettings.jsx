import { useState } from "react";
import { Button, Field } from "./ui.jsx";
const statuses = {
  sent: "已傳送",
  pending: "等待傳送",
  sending: "傳送中",
  failed: "傳送失敗",
  unconfigured: "未設定 Webhook",
  obsolete: "排班已變更",
};
export default function DiscordSettings({ data, mutate, busy }) {
  const [urls, setUrls] = useState({ log: "", important: "", raid: "" });
  return (
    <section className="admin-panel">
      <h2>Discord 通知設定</h2>
      <p className="hint">
        三個頻道分開設定。網址僅存於伺服器，不會回傳到瀏覽器。舊交易通知維持原有設定。
      </p>
      <div className="discord-settings-grid">
        {[
          [
            "log",
            "Log 紀錄",
            "所有成功的登入、登出、活動與資料變更；不記錄密碼、Webhook 或每次頁面讀取",
          ],
          [
            "important",
            "重大通知",
            "新成員註冊及管理員修改資料、權限、活動設定等操作",
          ],
          [
            "raid",
            "出團通知",
            "暫時保留設定；排班入口目前隱藏，之後啟用時沿用",
          ],
        ].map(([key, label, description]) => (
          <form
            key={key}
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await mutate(
                  "discordSettings.save",
                  { channel: key, url: urls[key] },
                  "Webhook 已更新",
                )
              )
                setUrls((v) => ({ ...v, [key]: "" }));
            }}
          >
            <h3>{label}</h3>
            <p>{description}</p>
            <small>
              {data.discordSettings?.[key + "Configured"]
                ? "已設定"
                : "尚未設定"}
            </small>
            <Field
              label={`${label} Webhook URL`}
              type="password"
              required
              autoComplete="off"
              placeholder="https://discord.com/api/webhooks/…"
              value={urls[key]}
              onChange={(e) => setUrls({ ...urls, [key]: e.target.value })}
            />
            <Button primary disabled={busy}>
              儲存{label}設定
            </Button>
          </form>
        ))}
      </div>
      <p className="hint">
        成員的 Discord ID 可在「成員帳號」設定；各職業的 Discord
        貼圖可在「職業清單」編輯。
      </p>
      <p className="hint">
        伺服器僅保留最近 30
        筆通知狀態供失敗重試，不會無限累積；不再顯示逐筆紀錄。
      </p>
      {(data.deliveries || [])
        .filter(
          (e) =>
            ["failed", "unconfigured"].includes(e.status) &&
            ["log", "important"].includes(e.channel),
        )
        .slice(-5)
        .map((e) => (
          <div className="delivery-row" key={e.id}>
            <span>
              {e.channel === "important" ? "重大通知" : "Log"}：
              {statuses[e.status]}
            </span>
            <Button
              disabled={busy}
              onClick={() =>
                mutate("delivery.retry", { id: e.id }, "已重試通知")
              }
            >
              重試失敗通知
            </Button>
          </div>
        ))}
    </section>
  );
}
