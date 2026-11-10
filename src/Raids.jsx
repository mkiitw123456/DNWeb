import { useState } from "react";
import { CalendarDays, Plus, X } from "lucide-react";
import { Heading, Button, Field, Modal, Empty } from "./ui.jsx";
import ProfessionIcon from "./ProfessionIcon.jsx";
import {
  taipeiDay,
  taipeiTime,
  dateInput,
  nextSevenDays,
  mine,
  searchRoster,
} from "../shared/scheduling.js";
const statusLabel = {
  unsent: "尚未通知",
  pending: "準備通知",
  sending: "傳送中",
  sent: "已於 Discord 通知",
  failed: "通知失敗，可重試",
  unconfigured: "尚未設定出團 Webhook",
};
function CharacterPicker({ data, slots, index, onPick, onClose }) {
  const [query, setQuery] = useState(""),
    [professionId, setProfessionId] = useState(""),
    [expanded, setExpanded] = useState(null);
  const groups = searchRoster(data.roster, data.users, query, professionId);
  const chosenOwners = new Set(
    slots
      .filter((_, i) => i !== index)
      .map((id) => data.roster.find((c) => c.id === id)?.ownerId),
  );
  return (
    <Modal
      title={`選擇第 ${index + 1} 位成員`}
      onClose={onClose}
      explicitCloseOnly
    >
      <Field label="職業篩選">
        <select
          value={professionId}
          onChange={(e) => {
            setProfessionId(e.target.value);
            setExpanded(null);
          }}
        >
          <option value="">所有職業</option>
          {data.professions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="搜尋帳號或角色名稱"
        placeholder="輸入任意片段，不分大小寫"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setExpanded(null);
        }}
      />
      <p className="hint">
        先選擇帳號，再選擇他的角色。同一帳號每團只能佔一個位置。
      </p>
      <div className="roster-search-results">
        {groups.map((u) => (
          <section key={u.id} className="roster-search-group">
            <button
              className="roster-account"
              onClick={() => setExpanded(expanded === u.id ? null : u.id)}
              aria-expanded={expanded === u.id}
            >
              <span>
                <strong>{u.username}</strong>
                <small>
                  {u.characters.length} 個符合角色
                  {chosenOwners.has(u.id) ? " · 已在團內" : ""}
                </small>
              </span>
              {professionId ? (
                <ProfessionIcon
                  profession={data.professions.find(
                    (p) => p.id === professionId,
                  )}
                />
              ) : (
                <span>選擇角色</span>
              )}
            </button>
            {expanded === u.id &&
              u.characters.map((c) => (
                <button
                  key={c.id}
                  className="roster-character"
                  disabled={chosenOwners.has(u.id)}
                  onClick={() => onPick(c.id)}
                >
                  <span>{c.name}</span>
                  <ProfessionIcon
                    profession={data.professions.find(
                      (p) => p.id === c.professionId,
                    )}
                  />
                </button>
              ))}
          </section>
        ))}
        {!groups.length && (
          <p className="hint">找不到符合的帳號或角色，試試其他關鍵字或職業。</p>
        )}
      </div>
    </Modal>
  );
}
export default function Raids({ data, mutate, busy, ask }) {
  const [scope, setScope] = useState("all"),
    [selectedDay, setSelectedDay] = useState(""),
    [draft, setDraft] = useState(null),
    [step, setStep] = useState(1),
    [picker, setPicker] = useState(null);
  const [templateSource, setTemplateSource] = useState(null),
    [templateName, setTemplateName] = useState("");
  const days = nextSevenDays();
  const raids = [...(data.raids || [])].sort((a, b) => a.startsAt - b.startsAt);
  const shown = raids.filter(
    (r) =>
      (scope === "all" || mine(r, data.me.id)) &&
      (!selectedDay || taipeiDay(r.startsAt) === selectedDay),
  );
  const add = () => {
    setDraft({
      startsAt: dateInput(Date.now() + 3600000),
      dungeonId: data.dungeons[0]?.id || "",
      slots: Array(8).fill(null),
    });
    setStep(1);
  };
  const close = () => {
    setDraft(null);
    setPicker(null);
  };
  return (
    <div className="raids-page">
      <Heading
        title="出團排班"
        description="台灣時間 · 一起準備下一場冒險"
        onAdd={data.me.admin ? add : undefined}
        addLabel="新增出團"
      />
      <section className="raid-calendar" aria-label="我的未來七天排班">
        <div className="section-title">
          <h2>
            <CalendarDays size={18} /> 我的未來 7 天
          </h2>
          <small>今天起算 · 紅色表示有安排到你</small>
        </div>
        <div className="raid-week">
          {days.map((day, i) => {
            const own = raids.filter(
              (r) => mine(r, data.me.id) && taipeiDay(r.startsAt) === day,
            );
            return (
              <button
                key={day}
                className={`${own.length ? "has-raid" : ""} ${selectedDay === day ? "selected" : ""}`}
                aria-pressed={selectedDay === day}
                aria-label={`${day} ${own.length} 場我的出團`}
                onClick={() => {
                  setSelectedDay(selectedDay === day ? "" : day);
                  setScope("mine");
                }}
              >
                <span>
                  {i === 0
                    ? "今天"
                    : new Intl.DateTimeFormat("zh-TW", {
                        timeZone: "Asia/Taipei",
                        weekday: "short",
                      }).format(new Date(day + "T12:00:00+08:00"))}
                </span>
                <strong>{day.slice(5).replace("-", "/")}</strong>
                <small>{own.length ? `${own.length} 場出團` : "無排班"}</small>
              </button>
            );
          })}
        </div>
      </section>
      {data.me.admin && data.raidTemplates?.length > 0 && (
        <section className="raid-templates" aria-label="常用出團名單">
          <h2>常用出團名單</h2>
          <p className="hint">套用已存的副本與成員，再選擇這次的出團時間。</p>
          <div className="template-list">
            {data.raidTemplates.map((t) => (
              <div key={t.id}>
                <div>
                  <strong>{t.name}</strong>
                  <small>
                    {t.dungeonName} · {t.slots.filter(Boolean).length} 人
                  </small>
                </div>
                <Button
                  onClick={() => {
                    setDraft({
                      startsAt: dateInput(Date.now() + 3600000),
                      dungeonId: t.dungeonId,
                      slots: [...t.slots],
                    });
                    setStep(1);
                  }}
                >
                  套用 {t.name}
                </Button>
                <Button
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await ask(
                        `刪除常用名單「${t.name}」？既有排班不會受到影響。`,
                      )
                    )
                      mutate(
                        "raidTemplate.delete",
                        { id: t.id },
                        "常用名單已刪除",
                      );
                  }}
                >
                  刪除範本
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="raid-filters">
        <div className="tabs">
          {[
            ["all", "所有出團"],
            ["mine", "只看自己"],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={scope === value}
              className={scope === value ? "active" : ""}
              onClick={() => setScope(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {selectedDay && (
          <Button onClick={() => setSelectedDay("")}>
            {selectedDay} · 清除日期篩選 <X size={14} />
          </Button>
        )}
      </div>
      {shown.length ? (
        <div className="raid-cards">
          {shown.map((r) => (
            <article className="raid-card" key={r.id}>
              <header>
                <span className="raid-date">
                  {taipeiDay(r.startsAt)} · {taipeiTime(r.startsAt)}
                  {r.startsAt < Date.now() ? " · 已結束" : ""}
                </span>
                <h2>{r.dungeonName}</h2>
                <small>
                  {r.slots.filter(Boolean).length} / 8 人
                  {mine(r, data.me.id) ? " · 你在這一團" : ""}
                </small>
              </header>
              <ol className="raid-slots">
                {r.slots.map((slot, i) => (
                  <li
                    key={i}
                    className={slot?.ownerId === data.me.id ? "is-me" : ""}
                  >
                    <span className="slot-number">{i + 1}</span>
                    {slot ? (
                      <>
                        <div>
                          <strong>{slot.name}</strong>
                          <small>
                            {slot.username}
                            {slot.unavailable ? " · 角色已刪除或停用" : ""}
                          </small>
                        </div>
                        <ProfessionIcon
                          profession={data.professions.find(
                            (p) => p.id === slot.professionId,
                          )}
                        />
                      </>
                    ) : (
                      <span className="muted">待補</span>
                    )}
                  </li>
                ))}
              </ol>
              <footer>
                <span
                  className={
                    ["failed", "unconfigured"].includes(r.notification)
                      ? "error"
                      : "muted"
                  }
                >
                  {statusLabel[r.notification] || "尚未通知"}
                </span>
                {data.me.admin && (
                  <div className="raid-actions">
                    <Button
                      onClick={() => {
                        setTemplateSource(r);
                        setTemplateName(r.dungeonName + " 常用團");
                      }}
                    >
                      存為常用團
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() => {
                        setDraft({
                          ...r,
                          startsAt: dateInput(r.startsAt),
                          slots: r.slots.map((x) => x?.characterId || null),
                        });
                        setStep(2);
                      }}
                    >
                      編輯
                    </Button>
                    <Button
                      disabled={
                        busy ||
                        r.startsAt < Date.now() ||
                        (["pending", "sending"].includes(r.notification) &&
                          Date.now() - (r.notificationAt || 0) < 60000)
                      }
                      onClick={async () => {
                        if (
                          await ask(
                            `將「${r.dungeonName}」出團名單發送至 Discord，並標記已綁定 ID 的參與者？`,
                          )
                        )
                          await mutate(
                            "raid.notify",
                            { id: r.id, revision: r.revision },
                            "已處理通知，請查看卡片傳送狀態",
                          );
                      }}
                    >
                      {r.notification === "sent" ? "重新通知" : "於 DC 通知"}
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={async () => {
                        if (
                          await ask(
                            "確定刪除此出團排班？已發送的 Discord 訊息不會撤回。",
                          )
                        )
                          mutate(
                            "raid.delete",
                            { id: r.id, revision: r.revision },
                            "排班已刪除",
                          );
                      }}
                    >
                      刪除
                    </Button>
                  </div>
                )}
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="目前沒有出團"
          description={
            selectedDay
              ? "這一天沒有符合篩選的排班。"
              : "建立排班後，成員就能在這裡查看出團時間與名單。"
          }
        />
      )}
      {templateSource && (
        <Modal
          title="儲存常用出團名單"
          onClose={() => setTemplateSource(null)}
          explicitCloseOnly
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await mutate(
                  "raidTemplate.save",
                  {
                    raidId: templateSource.id,
                    revision: templateSource.revision,
                    name: templateName,
                  },
                  "常用出團名單已儲存",
                )
              )
                setTemplateSource(null);
            }}
          >
            <Field
              label="範本名稱"
              required
              maxLength={60}
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
            />
            <p className="hint">
              儲存此團的副本與八個位置，下次套用時重新選擇日期與時間。
            </p>
            <div className="form-actions">
              <Button primary disabled={busy}>
                儲存常用名單
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {draft && (
        <Modal
          title={
            step === 1
              ? "新增出團 · 日期與副本"
              : `${draft.id ? "編輯" : "安排"}出團 · 八人名單`
          }
          onClose={close}
          explicitCloseOnly
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const selectedTime = new FormData(e.currentTarget).get(
                "startsAt",
              );
              if (step === 1) {
                setDraft((current) => ({ ...current, startsAt: selectedTime }));
                setStep(2);
                return;
              }
              if (
                await mutate(
                  "raid.save",
                  {
                    ...draft,
                    startsAt: new Date(
                      selectedTime + ":00+08:00",
                    ).toISOString(),
                  },
                  "出團排班已儲存",
                )
              )
                close();
            }}
          >
            <div className="form-grid">
              <Field
                label="出團日期與時間（台灣）"
                type="datetime-local"
                name="startsAt"
                onInput={(e) => {
                  const value = e.currentTarget.value;
                  setDraft((current) => ({ ...current, startsAt: value }));
                }}
                onBlur={(e) => {
                  const value = e.currentTarget.value;
                  setDraft((current) => ({ ...current, startsAt: value }));
                }}
                required
                value={draft.startsAt}
                onChange={(e) =>
                  setDraft({ ...draft, startsAt: e.target.value })
                }
              />
              <Field label="副本名稱">
                <select
                  required
                  value={draft.dungeonId}
                  onChange={(e) =>
                    setDraft({ ...draft, dungeonId: e.target.value })
                  }
                >
                  <option value="">請選擇副本</option>
                  {data.dungeons.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {!data.dungeons.length && (
              <p className="hint">請先到管理後台建立副本。</p>
            )}
            {step === 2 && (
              <>
                <p className="hint">
                  可先保留空位；儲存後可隨時編輯。修改已通知的名單後，請重新按「於
                  DC 通知」。
                </p>
                <div className="raid-editor-slots">
                  {draft.slots.map((id, i) => {
                    const c = data.roster.find((c) => c.id === id);
                    return (
                      <div key={i}>
                        <button
                          type="button"
                          aria-label={`選擇位置 ${i + 1}`}
                          onClick={() => setPicker(i)}
                        >
                          <span className="slot-number">{i + 1}</span>
                          {c ? (
                            <>
                              <span>
                                {c.name}
                                <small>
                                  {
                                    data.users.find((u) => u.id === c.ownerId)
                                      ?.username
                                  }
                                </small>
                              </span>
                              <ProfessionIcon
                                profession={data.professions.find(
                                  (p) => p.id === c.professionId,
                                )}
                              />
                            </>
                          ) : (
                            <>
                              <Plus size={18} />
                              <span>
                                {id ? "角色已失效，請重選" : "選擇角色"}
                              </span>
                            </>
                          )}
                        </button>
                        {id && (
                          <button
                            type="button"
                            aria-label={`清除位置 ${i + 1}`}
                            onClick={() =>
                              setDraft({
                                ...draft,
                                slots: draft.slots.map((x, j) =>
                                  j === i ? null : x,
                                ),
                              })
                            }
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            <div className="form-actions">
              <Button type="button" onClick={close}>
                取消
              </Button>
              <Button primary disabled={busy || !data.dungeons.length}>
                {step === 1 ? "建立並安排成員" : "儲存出團"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {picker !== null && draft && (
        <CharacterPicker
          data={data}
          slots={draft.slots}
          index={picker}
          onClose={() => setPicker(null)}
          onPick={(id) => {
            setDraft({
              ...draft,
              slots: draft.slots.map((x, i) => (i === picker ? id : x)),
            });
            setPicker(null);
          }}
        />
      )}
    </div>
  );
}
