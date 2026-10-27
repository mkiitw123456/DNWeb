import { useState } from "react";
import { Plus, SquarePen, Trash2 } from "lucide-react";
import Professions from "./Professions.jsx";
import QuantityTypes from "./QuantityTypes.jsx";
import {
  Heading,
  Button,
  Field,
  NumberField,
  Modal,
  FormActions,
} from "./ui.jsx";
export default function Admin({ data, mutate, busy, ask }) {
  const [tab, setTab] = useState("users"),
    [editing, setEditing] = useState(null),
    [url, setUrl] = useState("");
  return (
    <>
      <Heading title="管理後台" description="管理公會成員、副本與職業圖示" />
      {data.users.some(
        (u) => u.username.toLowerCase() === "mrairwolf" && !u.admin && u.active,
      ) && (
        <section className="group-panel">
          <h2>管理員設定</h2>
          <p>將現有 MrAirWolf 設為管理員，不刪除其他帳號或資料。</p>
          <Button
            disabled={busy}
            onClick={async () => {
              if (await ask("確定將現有 MrAirWolf 設為管理員？"))
                mutate(
                  "maintenance.promoteOwner",
                  {},
                  "MrAirWolf 已設為管理員",
                );
            }}
          >
            將 MrAirWolf 設為管理員
          </Button>
        </section>
      )}
      {!data.accountCleanupCompleted && (
        <section className="group-panel">
          <h2>一次性帳號整理</h2>
          <p>
            將現有 MrAirWolf 設為管理員，刪除 Wolf、shomen、Avalon、Ricky
            的帳號、角色、懸賞與其建立的群組及交易。其他人的歷史分帳保留金額並匿名化已刪除帳號。執行前自動備份資料。
          </p>
          <Button
            disabled={busy}
            onClick={async () => {
              if (
                await ask(
                  "確定備份並刪除 Wolf、shomen、Avalon、Ricky 的資料，將現有 MrAirWolf 設為管理員？若目前使用的帳號被刪除，將立即登出。",
                )
              )
                mutate(
                  "maintenance.cleanup",
                  { confirm: "MrAirWolf" },
                  "帳號整理完成，請使用 MrAirWolf 登入",
                );
            }}
          >
            備份並執行帳號整理
          </Button>
        </section>
      )}
      <div className="tabs">
        {[
          ["users", "成員帳號"],
          ["dungeons", "副本設定"],
          ["professions", "職業清單"],
          ["quantities", "數量項目"],
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
      {tab === "users" ? (
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
                  aria-label={`編輯帳號 ${u.username}`}
                  onClick={() => setEditing({ ...u, password: "" })}
                >
                  <SquarePen size={16} />
                  編輯
                </Button>
              </div>
            ))}
          </div>
          <p className="hint">停用帳號會阻止登入；既有角色與分帳紀錄會保留。</p>
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
            {tab === "users" ? (
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
    </>
  );
}
