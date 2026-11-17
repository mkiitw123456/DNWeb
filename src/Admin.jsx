import { useFeedback } from "./FeedbackHost.jsx";
import ActivityAdmin from "./ActivityAdmin.jsx";
import { useState, useEffect, useCallback } from "react";
import { Plus, SquarePen, Trash2 } from "lucide-react";
import Professions from "./Professions.jsx";
import DiscordSettings from "./DiscordSettings.jsx";
import QuantityTypes from "./QuantityTypes.jsx";
import {
  Heading,
  Button,
  Field,
  NumberField,
  Modal,
  FormActions,
} from "./ui.jsx";
export default function Admin({
  data,
  mutate,
  busy,
  ask,
  request,
  onUnauthorized,
  onActivityChange,
}) {
  const [activity, setActivity] = useState(data.activity || null),
    [activityError, setActivityError] = useState("");
  useFeedback(activityError);
  const [deleting, setDeleting] = useState(null),
    [deleteName, setDeleteName] = useState("");
  const refreshActivity = useCallback(async () => {
    const v = await request("activity.state");
    setActivity(v);
    onActivityChange(v);
    return v;
  }, [request, onActivityChange]);
  const [tab, setTab] = useState("users"),
    [editing, setEditing] = useState(null),
    [url, setUrl] = useState("");
  useEffect(() => {
    if (tab === "activities" || tab === "quiz")
      refreshActivity().catch((e) => {
        setActivityError(e.message);
        if (e.status === 401) onUnauthorized();
      });
  }, [tab, refreshActivity, onUnauthorized]);
  return (
    <>
      <Heading title="管理後台" description="管理公會成員、副本與職業圖示" />
      <div className="tabs">
        {[
          ["users", "成員帳號"],
          ["activities", "活動管理"],
          ["quiz", "快問快答"],
          ["dungeons", "副本設定"],
          ["professions", "職業清單"],
          ["quantities", "數量項目"],
          ["discord", "Discord 通知"],
        ].map(([id, name]) => (
          <button
            className={tab === id ? "active" : ""}
            aria-pressed={tab === id}
            key={id}
            onClick={() => {
              setTab(id);
              setEditing(null);
            }}
          >
            {name}
          </button>
        ))}
      </div>
      {tab === "activities" || tab === "quiz" ? (
        activity?.adminConfig ? (
          <ActivityAdmin
            key={tab}
            mode={tab}
            request={request}
            config={activity.adminConfig}
            users={data.users}
            refresh={refreshActivity}
            onUnauthorized={onUnauthorized}
          />
        ) : (
          <p>{activityError || "正在讀取活動設定…"}</p>
        )
      ) : tab === "users" ? (
        <section className="admin-panel">
          <div className="section-title">
            <h2>成員帳號</h2>
            <Button
              primary
              onClick={() =>
                setEditing({
                  username: "",
                  password: "",
                  discordId: "",
                  active: true,
                })
              }
            >
              <Plus size={17} />
              建立帳號
            </Button>
          </div>
          <div className="admin-rows">
            {data.users.map((u) => (
              <div className="admin-row" key={u.id}>
                <span className="avatar">{u.username[0]}</span>
                <div>
                  <strong>{u.username}</strong>
                  <small>
                    {u.discordId
                      ? `Discord · ${u.discordId}`
                      : "尚未設定 Discord ID"}
                  </small>
                </div>
                <span className="muted">
                  {u.admin ? "管理員" : u.active ? "使用中" : "已停用"}
                </span>
                <Button
                  disabled={u.admin && !data.canDelegate}
                  aria-label={`編輯帳號 ${u.username}`}
                  onClick={() => setEditing({ ...u, password: "" })}
                >
                  <SquarePen size={16} />
                  編輯
                </Button>
                {u.discordPendingId && (
                  <Button
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await ask(
                          `確認 ${u.username} 的 Discord ID 為 ${u.discordPendingId}？請先核對成員身分。`,
                        )
                      )
                        mutate(
                          "user.discordApprove",
                          { id: u.id, discordId: u.discordPendingId },
                          "Discord 綁定已確認",
                        );
                    }}
                  >
                    確認 Discord 申請
                  </Button>
                )}
                {u.id !== data.me.id &&
                  u.id !== data.adminOwnerId &&
                  (!u.admin || data.canDelegate) && (
                    <Button
                      disabled={busy}
                      aria-label={`刪除帳號 ${u.username}`}
                      onClick={() => {
                        setDeleting(u);
                        setDeleteName("");
                      }}
                    >
                      <Trash2 size={15} />
                      刪除
                    </Button>
                  )}
                {data.canDelegate && u.id !== data.me.id && u.active && (
                  <Button
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await ask(
                          `確定${u.admin ? "撤銷" : "授予"} ${u.username} 的管理員權限？`,
                        )
                      )
                        mutate(
                          "user.role",
                          { id: u.id, admin: !u.admin },
                          "管理員權限已更新",
                        );
                    }}
                  >
                    {u.admin ? "撤銷管理員" : "設為管理員"}
                  </Button>
                )}
              </div>
            ))}
          </div>
          <p className="hint">
            停用保留資料；刪除則永久移除帳號、角色、活動積分與紀錄。其他成員的歷史分帳保留金額並匿名處理。
          </p>
          {data.pendingUserDeletions > 0 && (
            <p className="error">
              有 {data.pendingUserDeletions} 筆背景清理尚未完成。
              <Button
                onClick={async () => {
                  try {
                    await request("maintenance.retryDeletions", {});
                    await mutate("state", {}, "資料清理完成");
                  } catch (e) {
                    setActivityError(e.message);
                  }
                }}
              >
                重試清理
              </Button>
              {activityError}
            </p>
          )}
        </section>
      ) : tab === "dungeons" ? (
        <section className="admin-panel">
          <div className="section-title">
            <h2>副本清單</h2>
            <Button primary onClick={() => setEditing({ name: "", max: 7 })}>
              <Plus size={17} />
              新增副本
            </Button>
          </div>
          <p className="hint">
            每週六早上 09:00 重置。調低上限時，超過上限的已完成次數會同步調整。
          </p>
          {data.dungeons.map((d) => (
            <div className="admin-row" key={d.id}>
              <strong>{d.name}</strong>
              <span className="muted">每週 {d.max} 場</span>
              <Button
                aria-label={`編輯副本 ${d.name}`}
                onClick={() => setEditing({ ...d })}
              >
                <SquarePen size={16} />
              </Button>
              <Button
                aria-label={`刪除副本 ${d.name}`}
                disabled={busy}
                onClick={async () => {
                  if (await ask("刪除副本及所有角色對應的次數？"))
                    mutate("dungeon.delete", { id: d.id }, "副本已刪除");
                }}
              >
                <Trash2 size={16} />
              </Button>
            </div>
          ))}
        </section>
      ) : tab === "discord" ? (
        <DiscordSettings data={data} mutate={mutate} busy={busy} />
      ) : tab === "quantities" ? (
        <QuantityTypes data={data} mutate={mutate} busy={busy} ask={ask} />
      ) : tab === "professions" ? (
        <Professions data={data} mutate={mutate} busy={busy} ask={ask} />
      ) : (
        <section className="admin-panel narrow">
          <h2>Discord 售出通知</h2>
          <p className="muted">
            {data.discordClaimsEnabled
              ? "已啟用 Discord 按鈕領取"
              : data.webhookConfigured
                ? "已設定通知網址"
                : "尚未設定通知網址"}
          </p>
          <p>
            物品賣出時，自動通知參與者可領取的金額。填寫成員的 Discord ID
            後，通知會標記該成員。
            {data.discordClaimsEnabled &&
              " 成員可直接按通知下方的「確認領取」，系統會依 Discord ID 登記本人的領取狀態。"}
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await mutate("webhook.save", { url }, "Discord 設定已儲存"))
                setUrl("");
            }}
          >
            <Field
              label="Webhook URL"
              type="password"
              placeholder="https://discord.com/api/webhooks/…"
              autoComplete="off"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <p className="hint">
              網址僅儲存在伺服器，不會回傳到瀏覽器。留白儲存會移除後台設定，改使用部署環境變數（若有）。
            </p>
            <Button primary disabled={busy}>
              儲存通知設定
            </Button>
          </form>
        </section>
      )}
      {editing && (
        <Modal
          title={
            tab === "users"
              ? editing.id
                ? "編輯帳號"
                : "建立帳號"
              : editing.id
                ? "編輯副本"
                : "新增副本"
          }
          onClose={() => setEditing(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await mutate(
                  tab === "users" ? "user.save" : "dungeon.save",
                  editing,
                )
              )
                setEditing(null);
            }}
          >
            {tab === "activities" || tab === "quiz" ? (
              activity?.adminConfig ? (
                <ActivityAdmin
                  key={tab}
                  mode={tab}
                  request={request}
                  config={activity.adminConfig}
                  users={data.users}
                  refresh={refreshActivity}
                  onUnauthorized={onUnauthorized}
                />
              ) : (
                <p>{activityError || "正在讀取活動設定…"}</p>
              )
            ) : tab === "users" ? (
              <>
                <Field
                  label="帳號"
                  required
                  maxLength={30}
                  value={editing.username}
                  onChange={(e) =>
                    setEditing({ ...editing, username: e.target.value })
                  }
                />
                <Field
                  label={editing.id ? "新密碼（留白保留原密碼）" : "密碼"}
                  type="password"
                  required={!editing.id}
                  maxLength={128}
                  autoComplete="new-password"
                  value={editing.password}
                  onChange={(e) =>
                    setEditing({ ...editing, password: e.target.value })
                  }
                />
                <Field
                  label="Discord ID（選填）"
                  inputMode="numeric"
                  pattern="[0-9]{17,20}"
                  value={editing.discordId}
                  onChange={(e) =>
                    setEditing({ ...editing, discordId: e.target.value })
                  }
                />
                {!editing.admin && (
                  <label className="switch-row">
                    啟用帳號
                    <input
                      type="checkbox"
                      role="switch"
                      checked={editing.active}
                      onChange={(e) =>
                        setEditing({ ...editing, active: e.target.checked })
                      }
                    />
                  </label>
                )}
              </>
            ) : (
              <>
                <Field
                  label="副本名稱"
                  required
                  maxLength={80}
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                />
                <NumberField
                  label="每週場次上限"
                  max={999}
                  value={editing.max}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      max: e.target.value === "" ? "" : Number(e.target.value),
                    })
                  }
                />
              </>
            )}
            <FormActions busy={busy} onClose={() => setEditing(null)} />
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal
          title="永久刪除帳號"
          onClose={() => {
            if (!busy) setDeleting(null);
          }}
        >
          <p>
            將永久刪除 {deleting.username}{" "}
            的帳號、角色及活動積分與紀錄。此操作無法還原。
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await mutate(
                  "user.delete",
                  { id: deleting.id, username: deleteName },
                  "帳號與相關資料已刪除",
                )
              )
                setDeleting(null);
            }}
          >
            <Field
              label="輸入完整帳號名稱以確認"
              value={deleteName}
              onChange={(e) => setDeleteName(e.target.value)}
              autoComplete="off"
              required
            />
            <Button primary disabled={busy || deleteName !== deleting.username}>
              永久刪除
            </Button>
          </form>
        </Modal>
      )}
    </>
  );
}
