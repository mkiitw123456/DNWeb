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
  const [urls, setUrls] = useState({ log: "", raid: "" });
  return (
    <section className="admin-panel">
      <h2>Discord 通知設定</h2>
      <p className="hint">
        兩個頻道分開設定。網址僅存於伺服器，不會回傳到瀏覽器。舊交易通知維持原有設定。
      </p>
      <div className="discord-settings-grid">
        {[
          ["log", "Log 紀錄", "新帳號、新角色、排班與其他資料操作紀錄"],
          [
            "raid",
            "出團通知",
            "按下卡片「於 DC 通知」時傳送，會標記已綁定 Discord ID 的參與者",
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
      <h3>最近通知紀錄</h3>
      {(data.deliveries || []).map((e) => (
        <div className="delivery-row" key={e.id}>
          <div>
            <strong>{e.channel === "raid" ? "出團通知" : "Log"}</strong>
            <small>{e.summary}</small>
          </div>
          <span>{statuses[e.status]}</span>
          {e.channel === "log" &&
            (["failed", "unconfigured"].includes(e.status) ||
              (["pending", "sending"].includes(e.status) &&
                Date.now() - (e.attemptAt || e.createdAt) > 60000)) && (
              <Button
                disabled={busy}
                onClick={() =>
                  mutate(
                    "delivery.retry",
                    { id: e.id },
                    "已重試，請查看通知狀態",
                  )
                }
              >
                重試
              </Button>
            )}
        </div>
      ))}
      {!data.deliveries?.length && <p className="muted">尚無通知紀錄</p>}
    </section>
  );
}
