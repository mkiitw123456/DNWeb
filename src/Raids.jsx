import useSubmitDialog from "./useSubmitDialog.js";
import { useEffect, useState } from "react";
import { apiRequest } from "./api.js";
import { CalendarDays, Check, Plus, X } from "lucide-react";
import { Heading, Button, Field, Modal, Empty } from "./ui.jsx";
import {
  taipeiDay,
  taipeiTime,
  dateInput,
  nextSevenDays,
  mine,
  searchRoster,
  raidAvailability,
} from "../shared/scheduling.js";
const statusLabel = {
  unsent: "尚未通知",
  pending: "準備通知",
  sending: "傳送中",
  sent: "已於 Discord 通知",
  failed: "通知失敗，可重試",
  unconfigured: "尚未設定出團 Webhook",
};
const gradeColors = { A: "#d8751f", S: "#9353d6", L: "#a82348" };
function MemberCard({ member, professions, subtitle, guildOwners }) {
  const profession = professions.find((p) => p.id === member.professionId);
  const gear = member.gear || {};
  return (
    <span
      className="raid-member"
      style={Object.fromEntries(
        ["equipment", "weapon", "accessory"].map((key) => [
          "--" + key,
          gradeColors[gear[key]] || "var(--border)",
        ]),
      )}
    >
      {guildOwners.has(member.ownerId) && <span className="raid-guild-star" role="img" aria-label="公會成員" title="公會成員">★</span>}
      {profession?.icon && (
        <img
          className="raid-job-icon"
          src={profession.icon}
          alt={profession.name}
        />
      )}
      <strong>{member.name}</strong>
      {subtitle && <small>{subtitle}</small>}
    </span>
  );
}
function CharacterPicker({
  guildOwners,
  data,
  available,
  availability,
  slots,
  index,
  onPick,
  onClose,
}) {
  const professions = [...data.professions];
  if (
    available.some((c) => !professions.some((p) => p.id === c.professionId))
  ) {
    professions.push({ id: "", name: "未設定職業" });
  }
  const [query, setQuery] = useState("");
  const [selectedProfessions, setSelectedProfessions] = useState([]);
  const groups = searchRoster(
    available.filter((c) => {
      const id = data.professions.some((p) => p.id === c.professionId)
        ? c.professionId
        : "";
      return selectedProfessions.includes(id);
    }),
    data.raidUsers ?? data.users,
    query,
  );
  const chosenOwners = new Set(
    slots
      .filter((_, i) => i !== index)
      .map((id) => data.roster.find((c) => c.id === id)?.ownerId),
  );
  return (
    <Modal title="選擇成員" onClose={onClose} explicitCloseOnly>
      <fieldset className="raid-professions">
        <legend>職業篩選</legend>
        <div className="raid-profession-options">
          {professions.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={selectedProfessions.includes(p.id)}
              onClick={() =>
                setSelectedProfessions((prev) =>
                  prev.includes(p.id)
                    ? prev.filter((id) => id !== p.id)
                    : [...prev, p.id],
                )
              }
            >
              {p.icon && <img src={p.icon} width="24" height="24" alt="" />}
              <span>{p.name}</span>
              {selectedProfessions.includes(p.id) && (
                <Check size={13} aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
      </fieldset>
      <Field
        label="搜尋 ID、帳號或角色名稱"
        placeholder="輸入任意片段，不分大小寫"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
        }}
      />
      <p className="hint">
        只列出在出團當週還有此副本場次的角色。同一帳號每團限選一個角色。
      </p>
      <div className="roster-search-results">
        {groups.flatMap((u) =>
          u.characters.map((c) => (
            <button
              className="member-choice"
              key={c.id}
              disabled={chosenOwners.has(u.id) || !availability(c).remaining}
              onClick={() => onPick(c.id)}
            >
              <MemberCard
                guildOwners={guildOwners}
                member={c}
                professions={data.professions}
                subtitle={
                  availability(c).reservedBy ||
                  "剩 " +
                    availability(c).remaining +
                    " 場" +
                    (chosenOwners.has(u.id) ? " · 已在團內" : "")
                }
              />
            </button>
          )),
        )}
        {!groups.length && (
          <p className="hint">
            {selectedProfessions.length
              ? "沒有符合條件且仍有此副本場次的角色。"
              : "請先勾選職業以顯示角色。"}
          </p>
        )}
      </div>
    </Modal>
  );
}
export default function Raids({ data, mutate, busy, ask, pendingSeats = [] }) {
  const [guildOwners, setGuildOwners] = useState(() => new Set());
  const [guildError, setGuildError] = useState(false);
  useEffect(() => {
    let live = true, pending = false;
    async function refresh() {
      if (document.hidden || pending) return;
      pending = true;
      try {
        const { owners } = await apiRequest("raid.guildMembers.state");
        if (live) { setGuildOwners(new Set(owners)); setGuildError(false); }
      } catch {
        if (live) { setGuildOwners(new Set()); setGuildError(true); }
      } finally { pending = false; }
    }
    refresh();
    const timer = setInterval(refresh, 300000);
    document.addEventListener("visibilitychange", refresh);
    return () => { live = false; clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [data.me.id]);
  const [scope, setScope] = useState("all"),
    [selectedDay, setSelectedDay] = useState(""),
    [step, setStep] = useState(1),
    [picker, setPicker] = useState(null);
  const raidDialog = useSubmitDialog();
  const { draft, setDraft } = raidDialog;
  const templateDialog = useSubmitDialog();
  const templateSource = templateDialog.draft;
  const [templateName, setTemplateName] = useState("");
  const [quick, setQuick] = useState(null);
  const quickDungeon =
    quick && data.dungeons.find((d) => d.id === quick.raid.dungeonId);
  const quickAvailability = (c) =>
    raidAvailability(
      c,
      quickDungeon,
      quick.raid.startsAt,
      raids,
      quick.raid.id,
    );
  const days = nextSevenDays();
  const raids = (data.raids || [])
    .map((raid) => {
      const edit = pendingSeats.find((item) => item.id === raid.id);
      if (!edit) return raid;
      if (edit.revision !== raid.revision)
        return { ...raid, savingSeat: edit.index };
      const character = data.roster.find((c) => c.id === edit.characterId);
      const preview = character
        ? { ...character, characterId: character.id }
        : null;
      return {
        ...raid,
        savingSeat: edit.index,
        slots: raid.slots.map((slot, i) => (i === edit.index ? preview : slot)),
      };
    })
    .sort((a, b) => a.startsAt - b.startsAt);
  const shown = raids.filter(
    (r) =>
      (scope === "all" || mine(r, data.me.id)) &&
      (!selectedDay || taipeiDay(r.startsAt) === selectedDay),
  );
  const add = () => {
    raidDialog.open({
      submissionId: crypto.randomUUID(),
      startsAt: dateInput(Date.now() + 3600000),
      dungeonId: data.dungeons[0]?.id || "",
      slots: Array(8).fill(null),
    });
    setStep(1);
  };
  const dungeon = data.dungeons.find((d) => d.id === draft?.dungeonId);
  const startsAt = Date.parse((draft?.startsAt || "") + ":00+08:00");
  const availability = (c) =>
    raidAvailability(c, dungeon, startsAt, raids, draft?.id);
  const remaining = (c) => availability(c).remaining;
  const available = draft
    ? data.roster.filter((c) => remaining(c) > 0 || availability(c).reservedBy)
    : [];
  const eligibleIds = new Set(
    available.filter((c) => remaining(c) > 0).map((c) => c.id),
  );
  const invalidSlots =
    draft?.slots.filter((id) => id && !eligibleIds.has(id)).length || 0;
  const close = () => {
    raidDialog.close();
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
      {guildError && <p className="hint" role="status">暫時無法確認 Discord 公會身分，排班仍可使用。</p>}
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
                    raidDialog.open({
                      submissionId: crypto.randomUUID(),
                      startsAt: dateInput(Date.now() + 3600000),
                      dungeonId: t.dungeonId,
                      slots: [...t.slots],
                      fromTemplate: true,
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
                  {r.joinNow &&
                  ["sent", "pending", "sending"].includes(r.notification)
                    ? "直接進隊"
                    : taipeiDay(r.startsAt) +
                      " · " +
                      taipeiTime(r.startsAt) +
                      (r.startsAt < Date.now() ? " · 已開團" : "")}
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
                    {slot ? (
                      <MemberCard
                        member={slot}
                        guildOwners={guildOwners}
                        professions={data.professions}
                        subtitle={slot.unavailable ? "已停用" : ""}
                      />
                    ) : (
                      <span className="muted">待補</span>
                    )}
                    {r.savingSeat === i && <small role="status">儲存中…</small>}
                    {data.me.admin && !r.settledAt && (
                      <div className="seat-tools">
                        <Button
                          disabled={busy || r.savingSeat != null}
                          onClick={() => setQuick({ raid: r, index: i })}
                        >
                          {slot ? "換人" : "新增"}
                        </Button>
                        {slot && (
                          <Button
                            disabled={busy || r.savingSeat != null}
                            onClick={async () => {
                              if (
                                await ask(
                                  "移除第 " +
                                    (i + 1) +
                                    " 席的 " +
                                    slot.name +
                                    "？",
                                )
                              )
                                await mutate(
                                  "raid.seat",
                                  {
                                    id: r.id,
                                    revision: r.revision,
                                    index: i,
                                    characterId: null,
                                  },
                                  "已移除成員",
                                );
                            }}
                          >
                            移除
                          </Button>
                        )}
                      </div>
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
                {r.settledAt && <strong> · 已結算</strong>}
                {data.me.admin && !r.settledAt && (
                  <div className="raid-actions">
                    <Button
                      primary
                      disabled={
                        busy ||
                        r.savingSeat != null ||
                        r.startsAt > Date.now() ||
                        !r.slots.some(Boolean)
                      }
                      onClick={async () => {
                        const names = r.slots
                          .filter(Boolean)
                          .map((s) => s.name);
                        if (
                          await ask(
                            "結算「" +
                              r.dungeonName +
                              "」？" +
                              names.join("、") +
                              " 各扣 1 場，結算後將鎖定名單。",
                          )
                        )
                          await mutate(
                            "raid.settle",
                            { id: r.id, revision: r.revision },
                            "已結算並扣除入場次數",
                          );
                      }}
                    >
                      結算
                    </Button>
                    <Button
                      disabled={busy || r.savingSeat != null}
                      onClick={() => {
                        templateDialog.open(r);
                        setTemplateName(r.dungeonName + " 常用團");
                      }}
                    >
                      存為常用團
                    </Button>
                    <Button
                      disabled={busy || r.savingSeat != null}
                      onClick={() => {
                        raidDialog.open({
                          ...r,
                          startsAt: dateInput(r.startsAt),
                          slots: r.slots.map((x) => x?.characterId || null),
                        });
                        setStep(2);
                      }}
                    >
                      編輯
                    </Button>
                    {[false, true].map((joinNow) => (
                      <Button
                        key={String(joinNow)}
                        disabled={
                          busy ||
                          r.savingSeat != null ||
                          (!joinNow && r.startsAt < Date.now()) ||
                          (["pending", "sending"].includes(r.notification) &&
                            Date.now() - (r.notificationAt || 0) < 60000)
                        }
                        onClick={async () => {
                          const prompt = joinNow
                            ? `通知「${r.dungeonName}」的團員直接進隊？Discord 將顯示「直接進隊」及名單。`
                            : `將「${r.dungeonName}」出團時間與名單發送至 Discord？`;
                          if (await ask(prompt))
                            await mutate(
                              "raid.notify",
                              { id: r.id, revision: r.revision, joinNow },
                              "已處理通知，請查看卡片傳送狀態",
                            );
                        }}
                      >
                        {joinNow
                          ? "通知直接進隊"
                          : r.notification === "sent"
                            ? "重新通知時間"
                            : "於 DC 通知"}
                      </Button>
                    ))}
                    <Button
                      disabled={busy || r.savingSeat != null}
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
      {quick && (
        <CharacterPicker
          guildOwners={guildOwners}
          data={data}
          available={data.roster.filter(
            (c) =>
              quickAvailability(c).remaining > 0 ||
              quickAvailability(c).reservedBy,
          )}
          availability={quickAvailability}
          slots={quick.raid.slots.map((s) => s?.characterId)}
          index={quick.index}
          onClose={() => setQuick(null)}
          onPick={(id) => {
            setQuick(null);
            mutate(
              "raid.seat",
              {
                id: quick.raid.id,
                revision: quick.raid.revision,
                index: quick.index,
                characterId: id,
              },
              "已更新席次",
            );
          }}
        />
      )}
      {templateSource && (
        <Modal
          title="儲存常用出團名單"
          onClose={templateDialog.close}
          explicitCloseOnly
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await templateDialog.submit(() => mutate(
                  "raidTemplate.save",
                  {
                    raidId: templateSource.id,
                    revision: templateSource.revision,
                    name: templateName,
                  },
                  "常用出團名單已儲存",
                ));
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
                setDraft((current) => ({
                  ...current,
                  startsAt: selectedTime,
                  skipped: current.fromTemplate ? invalidSlots : 0,
                  slots: current.fromTemplate
                    ? current.slots.map((id) =>
                        eligibleIds.has(id) ? id : null,
                      )
                    : current.slots,
                }));
                setStep(2);
                return;
              }
              await raidDialog.submit(() => mutate(
                  "raid.save",
                  {
                    id: draft.id,
                    revision: draft.revision,
                    submissionId: draft.id ? undefined : draft.submissionId,
                    dungeonId: draft.dungeonId,
                    slots: draft.slots,
                    startsAt: new Date(
                      selectedTime + ":00+08:00",
                    ).toISOString(),
                  },
                  "出團排班已儲存",
                ));
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
                {draft.skipped > 0 && (
                  <p role="status">
                    常用名單有 {draft.skipped}{" "}
                    個位置的角色已失效或場次用完，已留空待補。
                  </p>
                )}
                {invalidSlots > 0 && (
                  <p role="alert">部分位置已無法出團，請清除或更換角色。</p>
                )}
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
                          {c ? (
                            <MemberCard
                              member={c}
                              guildOwners={guildOwners}
                              professions={data.professions}
                              subtitle={`剩 ${remaining(c)} 場`}
                            />
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
              <Button
                primary
                disabled={busy || !dungeon || (step === 2 && invalidSlots > 0)}
              >
                {step === 1 ? "建立並安排成員" : "儲存出團"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {picker !== null && draft && (
        <CharacterPicker
          guildOwners={guildOwners}
          data={data}
          available={available}
          availability={availability}
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
