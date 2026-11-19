import { matchesContent } from "./activity-calendar.js";
import EventBank from "./EventBank.jsx";
import CampaignSettings from "./CampaignSettings.jsx";
import ActivityCalendar from "./ActivityCalendar.jsx";
import { useFeedback } from "./FeedbackHost.jsx";
import QuizScores from "./QuizScores.jsx";
import { useState, useRef } from "react";
import { Plus, Trash2, Download, Save } from "lucide-react";
import { Button, Field, NumberField } from "./ui.jsx";
import { taiwanTime } from "./Lobby.jsx";
function range(mode = "week") {
  const now = new Date(Date.now() + 8 * 3600000),
    to = now.toISOString().slice(0, 10);
  if (mode === "month") now.setUTCDate(1);
  else now.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7));
  return { from: now.toISOString().slice(0, 10), to };
}
function csvDownload(rows, filename) {
  const cell = (x) =>
    '"' +
    String(x ?? "")
      .replace(/^[=+\-@\t\r]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const blob = new Blob(
    ["\ufeff" + rows.map((row) => row.map(cell).join(",")).join("\r\n")],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function ActivityAdmin({
  request,
  mode = "activities",
  config,
  users,
  refresh,
  onUnauthorized,
}) {
  const [tab, setTab] = useState(mode === "quiz" ? "questions" : "rules"),
    [categories, setCategories] = useState([]),
    [fortuneSearch, setFortuneSearch] = useState(""),
    [draft, setDraft] = useState(() => structuredClone(config)),
    [dates, setDates] = useState(() => range()),
    [report, setReport] = useState(null),
    [reportDates, setReportDates] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  useFeedback(error, notice);
  const lock = useRef(false),
    adjustment = useRef(null);
  async function run(type, payload) {
    if (lock.current) return null;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      return await request(type, payload);
    } catch (e) {
      setError(e.message);
      if (e.status === 401) onUnauthorized();
      return null;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function loadReport() {
    const r = await run("activity.report", dates);
    if (r) {
      setReport(r);
      setReportDates({ ...dates });
    }
  }
  const updateActivity = (i, key, value) =>
    setDraft((d) => ({
      ...d,
      activities: d.activities.map((a, n) =>
        n === i ? { ...a, [key]: value } : a,
      ),
    }));
  const updateQuestion = (i, key, value) => {
    if (key === "category") setCategories([]);
    setDraft((d) => ({
      ...d,
      questions: d.questions.map((q, n) =>
        n === i ? { ...q, [key]: value } : q,
      ),
    }));
  };
  const save = async () => {
    const r = await run("activity.config", {
      ...draft,
      quizCategories: (draft.quizCategories ?? allCategories).filter((c) =>
        allCategories.includes(c),
      ),
    });
    if (r) {
      try {
        const v = await refresh();
        setDraft(structuredClone(v.adminConfig));
        setNotice("活動設定與日曆已儲存，新提交會使用新版設定。");
      } catch (e) {
        setError(e.message);
      }
    }
  };
  const summarize = (m) => {
    const rows = report.rows.filter((r) => r.memberId === m.memberId),
      participations = rows.filter((r) => r.kind === "participation");
    return {
      ...m,
      periodCount: participations.length,
      periodPoints: rows.reduce((n, r) => n + r.delta, 0),
    };
  };
  const members = report?.members.map(summarize) || [];
  const allCategories = [...new Set(draft.questions.map((q) => q.category))];
  return (
    <section className="activity-admin">
      <div className="tabs">
        {(mode === "quiz"
          ? [
              ["questions", "快問快答題庫"],
              ["scores", "成員快問快答分數"],
            ]
          : [
              ["rules", "活動規則與抽籤"],
              ["events", "冒險事件題庫"],
              ["campaigns", "正式劇本"],
              ["calendar", "活動日曆"],
              ["reports", "參與報表與積分調整"],
            ]
        ).map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => {
              setTab(id);
              setError("");
              setNotice("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="activity-success" role="status">
          {notice}
        </p>
      )}
      {tab === "campaigns" ? (
        <CampaignSettings
          scripts={draft.scripts ?? []}
          schedule={draft.campaignSchedule ?? []}
          onChange={(campaignSchedule) => setDraft((d) => ({ ...d, campaignSchedule }))}
          busy={busy}
          save={save}
        />
      ) : tab === "events" ? (
        <EventBank
          events={draft.events}
          unlimited={draft.eventUnlimited}
          onUnlimited={(eventUnlimited) =>
            setDraft((d) => ({ ...d, eventUnlimited }))
          }
          busy={busy}
          save={save}
          onChange={(events) => setDraft((d) => ({ ...d, events }))}
        />
      ) : tab === "calendar" ? (
        <ActivityCalendar
          config={draft}
          busy={busy}
          onSave={save}
          onChange={(schedule) => setDraft((d) => ({ ...d, schedule }))}
        />
      ) : tab === "scores" ? (
        <QuizScores request={request} onUnauthorized={onUnauthorized} />
      ) : tab !== "reports" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {tab === "rules" && (
            <>
              <div className="lobby-section-title">
                <h2>每日活動規則</h2>
                <Button primary disabled={busy}>
                  <Save size={16} />
                  儲存設定
                </Button>
              </div>
              <p className="muted">
                所有小遊戲每日 09:00 重置；活動週榜於週一 00:00 換週。規則版本 v
                {draft.version}
                ；歷史積分不會隨設定變動。
              </p>
              <div className="activity-rule-grid">
                {draft.activities.map((a, i) => (
                  <section key={a.id} className="activity-rule">
                    <Field
                      label="活動名稱"
                      value={a.title}
                      maxLength={60}
                      required
                      onChange={(e) =>
                        updateActivity(i, "title", e.target.value)
                      }
                    />
                    <Field
                      label="活動說明"
                      value={a.description}
                      maxLength={200}
                      required
                      onChange={(e) =>
                        updateActivity(i, "description", e.target.value)
                      }
                    />
                    <div className="activity-form-grid">
                      <NumberField
                        label="每日次數"
                        max={10}
                        value={a.dailyLimit}
                        onChange={(e) =>
                          updateActivity(
                            i,
                            "dailyLimit",
                            Number(e.target.value),
                          )
                        }
                      />
                      {a.type !== "event" && (
                        <NumberField
                          label="參與積分"
                          max={100}
                          value={a.points}
                          onChange={(e) =>
                            updateActivity(i, "points", Number(e.target.value))
                          }
                        />
                      )}
                      {a.type === "quiz" && (
                        <NumberField
                          label="答對加分"
                          max={100}
                          value={a.bonus}
                          onChange={(e) =>
                            updateActivity(i, "bonus", Number(e.target.value))
                          }
                        />
                      )}
                    </div>
                    <label className="switch-row">
                      開放活動
                      <input
                        type="checkbox"
                        checked={a.enabled}
                        onChange={(e) =>
                          updateActivity(i, "enabled", e.target.checked)
                        }
                      />
                    </label>
                  </section>
                ))}
              </div>
              <h2>每日冒險抽籤內容</h2>
              <Field
                label="抽籤標題"
                required
                maxLength={120}
                value={draft.fortuneIntro ?? "今天，會遇見什麼好事？"}
                onChange={(e) =>
                  setDraft({ ...draft, fortuneIntro: e.target.value })
                }
              />
              <Field
                label="抽籤內文"
                required
                maxLength={500}
                value={draft.fortuneBody ?? "輕輕抽一張籤，帶著好心情出發。"}
                onChange={(e) =>
                  setDraft({ ...draft, fortuneBody: e.target.value })
                }
              />
              <div className="lobby-section-title">
                <h3>籤文結果</h3>
                <Button
                  type="button"
                  disabled={draft.fortunes.length >= 100}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      fortunes: [
                        ...draft.fortunes,
                        { id: crypto.randomUUID(), title: "", body: "" },
                      ],
                    })
                  }
                >
                  新增籤文
                </Button>
              </div>
              <Field
                label="搜尋籤文"
                type="search"
                placeholder="輸入標題或內文的任意文字"
                value={fortuneSearch}
                onChange={(e) => setFortuneSearch(e.target.value)}
              />
              {!draft.fortunes.some(
                (f) =>
                  !f.title ||
                  !f.body ||
                  matchesContent(f.title + " " + f.body, fortuneSearch),
              ) && (
                <p className="muted" role="status">
                  找不到符合的籤文，請換個關鍵字。
                </p>
              )}
              <div className="quiz-question-grid fortune-question-grid">
                {draft.fortunes.map(
                  (f, i) =>
                    (!f.title ||
                      !f.body ||
                      matchesContent(
                        f.title + " " + f.body,
                        fortuneSearch,
                      )) && (
                      <details
                        className="quiz-editor fortune-editor"
                        key={f.id}
                      >
                        <summary>{f.title || "新籤文（點擊編輯）"}</summary>
                        <div className="quiz-editor-fields">
                          <Field
                            label={`籤文 ${i + 1} 標題`}
                            required
                            maxLength={120}
                            value={f.title}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                fortunes: draft.fortunes.map((v, n) =>
                                  n === i ? { ...v, title: e.target.value } : v,
                                ),
                              })
                            }
                          />
                          <Field label={`籤文 ${i + 1} 內文`}>
                            <textarea
                              required
                              maxLength={500}
                              rows={3}
                              value={f.body}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  fortunes: draft.fortunes.map((v, n) =>
                                    n === i
                                      ? { ...v, body: e.target.value }
                                      : v,
                                  ),
                                })
                              }
                            />
                          </Field>
                          <Button
                            type="button"
                            disabled={draft.fortunes.length <= 1}
                            onClick={() =>
                              setDraft({
                                ...draft,
                                fortunes: draft.fortunes.filter(
                                  (_, n) => n !== i,
                                ),
                              })
                            }
                          >
                            移除籤文 {i + 1}
                          </Button>
                        </div>
                      </details>
                    ),
                )}
              </div>
            </>
          )}
          {tab === "questions" && (
            <>
              <div className="lobby-section-title">
                <h2>快問快答題庫</h2>
                <Button
                  type="button"
                  disabled={draft.questions.length >= 100}
                  onClick={() => {
                    setCategories([]);
                    setDraft({
                      ...draft,
                      questions: [
                        ...draft.questions,
                        {
                          id: crypto.randomUUID(),
                          question: "",
                          options: ["", ""],
                          correct: 0,
                          explanation: "",
                          category: "公會知識",
                        },
                      ],
                    });
                  }}
                >
                  <Plus size={16} />
                  新增題目
                </Button>
              </div>
              <p className="muted">
                可維護 1–100 題；答案與解析只會在成員提交後回傳。
              </p>
              <fieldset className="quiz-categories quiz-availability">
                <legend>每日出題的開放分類</legend>
                {allCategories.map((c) => (
                  <label key={c}>
                    <input
                      type="checkbox"
                      checked={(draft.quizCategories ?? allCategories).includes(
                        c,
                      )}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          quizCategories: e.target.checked
                            ? [...(d.quizCategories ?? allCategories), c]
                            : (d.quizCategories ?? allCategories).filter(
                                (x) => x !== c,
                              ),
                        }))
                      }
                    />
                    {c || "未分類"}
                  </label>
                ))}
              </fieldset>
              <p className="muted">
                儲存後，所有人每天從勾選的分類隨機出題；台灣時間每日 09:00
                更新題目與答題次數，分數繼續累積。同一日重新整理不會換題。以下篩選僅影響管理畫面。
              </p>
              <fieldset className="quiz-categories">
                <legend>篩選分類（未勾選時顯示全部）</legend>
                {allCategories.map((c) => (
                  <label key={c}>
                    <input
                      type="checkbox"
                      checked={categories.includes(c)}
                      onChange={(e) =>
                        setCategories(
                          e.target.checked
                            ? [...categories, c]
                            : categories.filter((x) => x !== c),
                        )
                      }
                    />
                    {c || "未分類"}
                  </label>
                ))}
              </fieldset>
              <p className="muted">
                在題目內填寫新分類即可建立分類，例如海龍、綠龍。新增題目會顯示在下方。
              </p>
              <div className="quiz-question-grid">
                {draft.questions.map(
                  (q, i) =>
                    (!categories.length ||
                      categories.includes(q.category) ||
                      !q.question) && (
                      <details key={i} className="quiz-editor">
                        <summary>{q.question || "新題目（點擊編輯）"}</summary>
                        <div className="quiz-editor-fields">
                          <div className="lobby-section-title">
                            <h3>題目 {i + 1}</h3>
                            <Button
                              type="button"
                              aria-label={`刪除題目 ${i + 1}`}
                              disabled={draft.questions.length <= 1}
                              onClick={() =>
                                setDraft({
                                  ...draft,
                                  questions: draft.questions.filter(
                                    (_, n) => n !== i,
                                  ),
                                })
                              }
                            >
                              <Trash2 size={15} />
                              刪除
                            </Button>
                          </div>
                          <Field
                            label="題目"
                            required
                            maxLength={300}
                            value={q.question}
                            onChange={(e) =>
                              updateQuestion(i, "question", e.target.value)
                            }
                          />
                          <div className="activity-form-grid">
                            <Field
                              label="分類"
                              required
                              maxLength={40}
                              value={q.category}
                              onChange={(e) =>
                                updateQuestion(i, "category", e.target.value)
                              }
                            />
                          </div>
                          {q.options.map((o, j) => (
                            <Field
                              key={j}
                              label={`選項 ${j + 1}`}
                              required
                              maxLength={120}
                              value={o}
                              onChange={(e) =>
                                updateQuestion(
                                  i,
                                  "options",
                                  q.options.map((x, n) =>
                                    n === j ? e.target.value : x,
                                  ),
                                )
                              }
                            />
                          ))}
                          <div className="activity-editor-actions">
                            <Button
                              type="button"
                              disabled={q.options.length >= 6}
                              onClick={() =>
                                updateQuestion(i, "options", [...q.options, ""])
                              }
                            >
                              新增選項
                            </Button>
                            <Button
                              type="button"
                              disabled={q.options.length <= 2}
                              onClick={() =>
                                setDraft((d) => ({
                                  ...d,
                                  questions: d.questions.map((x, n) =>
                                    n === i
                                      ? {
                                          ...x,
                                          options: x.options.slice(0, -1),
                                          correct: Math.min(
                                            x.correct,
                                            x.options.length - 2,
                                          ),
                                        }
                                      : x,
                                  ),
                                }))
                              }
                            >
                              移除最後選項
                            </Button>
                          </div>
                          <Field label="正確答案">
                            <select
                              value={q.correct}
                              onChange={(e) =>
                                updateQuestion(
                                  i,
                                  "correct",
                                  Number(e.target.value),
                                )
                              }
                            >
                              {q.options.map((o, j) => (
                                <option key={j} value={j}>
                                  選項 {j + 1}：{o}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field
                            label="答案解析"
                            required
                            maxLength={500}
                            value={q.explanation}
                            onChange={(e) =>
                              updateQuestion(i, "explanation", e.target.value)
                            }
                          />
                        </div>
                      </details>
                    ),
                )}
              </div>
            </>
          )}
          <div className="activity-settings-actions">
            <Button primary disabled={busy}>
              <Save size={16} />
              儲存設定
            </Button>
          </div>
        </form>
      ) : (
        <>
          <h2>網站活動參與報表</h2>
          <p className="muted">
            明細保留 35
            天，累積積分永久保留。這份報表只包含網站活動，不代表完整的遊戲或
            Discord 貢獻。最多查詢 35 天、5,000 筆紀錄。
          </p>
          <form
            className="report-filters"
            onSubmit={(e) => {
              e.preventDefault();
              loadReport();
            }}
          >
            <Field
              label="開始日期"
              type="date"
              required
              value={dates.from}
              onChange={(e) => setDates({ ...dates, from: e.target.value })}
            />
            <Field
              label="結束日期"
              type="date"
              required
              value={dates.to}
              onChange={(e) => setDates({ ...dates, to: e.target.value })}
            />
            <Button disabled={busy} primary>
              查詢報表
            </Button>
            <Button type="button" onClick={() => setDates(range())}>
              本週
            </Button>
            <Button type="button" onClick={() => setDates(range("month"))}>
              本月
            </Button>
          </form>
          {report && (
            <>
              <div className="lobby-section-title">
                <h3>
                  {reportDates.from} ～ {reportDates.to}
                </h3>
                <Button
                  onClick={() =>
                    csvDownload(
                      [
                        [
                          "成員 ID",
                          "帳號",
                          "遊戲暱稱",
                          "期間參與次數",
                          "期間積分",
                          "累積積分",
                          "累積參與",
                          "最後參與（台灣時間）",
                        ],
                        ...members.map((m) => [
                          m.memberId,
                          m.username,
                          m.nickname,
                          m.periodCount,
                          m.periodPoints,
                          m.total,
                          m.count,
                          m.lastAt ? taiwanTime(m.lastAt) : "",
                        ]),
                      ],
                      `guild-summary-${reportDates.from}.csv`,
                    )
                  }
                >
                  <Download size={15} />
                  匯出摘要 CSV
                </Button>
              </div>
              <div className="report-summary">
                <span>
                  參與人數{" "}
                  <b>{members.filter((m) => m.periodCount > 0).length}</b>
                </span>
                {draft.activities.map((a) => (
                  <span key={a.id}>
                    {a.title}{" "}
                    <b>
                      {report.rows.filter((r) => r.activityId === a.id).length}
                    </b>{" "}
                    次
                  </span>
                ))}
              </div>
              <div className="activity-table-scroll">
                <table className="activity-table">
                  <thead>
                    <tr>
                      {[
                        "成員",
                        "期間參與",
                        "期間積分",
                        "累積積分",
                        "最後參與",
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.memberId}>
                        <td>
                          {m.nickname || m.username}
                          <small>
                            {m.username}
                            {!m.active ? " · 已停用" : ""}
                          </small>
                        </td>
                        <td>{m.periodCount}</td>
                        <td>{m.periodPoints}</td>
                        <td>{m.total}</td>
                        <td>{m.lastAt ? taiwanTime(m.lastAt) : "尚未參與"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="lobby-section-title">
                <h3>紀錄明細與調整軌跡</h3>
                <Button
                  onClick={() =>
                    csvDownload(
                      [
                        [
                          "紀錄 ID",
                          "成員 ID",
                          "活動",
                          "類型",
                          "台灣時間",
                          "積分變動",
                          "調整前",
                          "調整後",
                          "結果",
                          "規則版本",
                          "操作者",
                          "原因",
                        ],
                        ...report.rows.map((r) => [
                          r.id,
                          r.memberId,
                          r.title,
                          r.kind,
                          taiwanTime(r.createdAt),
                          r.delta,
                          r.before,
                          r.after,
                          r.summary,
                          r.version,
                          r.operatorId,
                          r.reason,
                        ]),
                      ],
                      `guild-ledger-${reportDates.from}.csv`,
                    )
                  }
                >
                  <Download size={15} />
                  匯出明細 CSV
                </Button>
              </div>
              <div className="activity-table-scroll">
                <table className="activity-table">
                  <thead>
                    <tr>
                      {[
                        "時間",
                        "成員",
                        "項目／原因",
                        "變動",
                        "調整前 → 後",
                        "操作者",
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.slice(0, 100).map((r) => (
                      <tr key={r.id}>
                        <td>{taiwanTime(r.createdAt)}</td>
                        <td>
                          {users.find((u) => u.id === r.memberId)?.username ||
                            r.memberId}
                        </td>
                        <td>
                          {r.title}
                          <small>{r.summary}</small>
                        </td>
                        <td>
                          {r.delta > 0 ? "+" : ""}
                          {r.delta}
                        </td>
                        <td>
                          {r.before} → {r.after}
                        </td>
                        <td>
                          {users.find((u) => u.id === r.operatorId)?.username ||
                            r.operatorId}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!report.rows.length && (
                  <p className="muted">這段期間尚無紀錄。</p>
                )}
              </div>
              {report.rows.length > 100 && (
                <p className="muted">
                  畫面顯示前 100 筆，CSV 包含查詢範圍內所有紀錄。
                </p>
              )}
            </>
          )}
          <section className="adjustment-form">
            <h3>調整成員積分</h3>
            <p className="muted">
              調整會計入本週與累積積分，不增加參與次數。所有調整均保留操作者、原因及調整前後數值。
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                if (!adjustment.current) {
                  const f = new FormData(form);
                  adjustment.current = {
                    submissionId: crypto.randomUUID(),
                    memberId: f.get("memberId"),
                    delta: Number(f.get("delta")),
                    reason: f.get("reason"),
                  };
                }
                const r = await run("activity.adjust", adjustment.current);
                if (r) {
                  adjustment.current = null;
                  form.reset();
                  setNotice("積分已調整並留下稽核紀錄。");
                  setReport(null);
                  refresh().catch((e) => setError(e.message));
                }
              }}
            >
              <fieldset disabled={busy || !!adjustment.current}>
                <Field label="成員帳號">
                  <select name="memberId" required>
                    <option value="">選擇成員</option>
                    {users
                      .filter((u) => u.active)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.username}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field
                  label="調整分數（扣分請填負數）"
                  name="delta"
                  type="number"
                  step="1"
                  min="-10000"
                  max="10000"
                  required
                />
                <Field
                  label="調整原因"
                  name="reason"
                  maxLength={300}
                  required
                />
              </fieldset>
              <Button primary disabled={busy}>
                {adjustment.current ? "重試同一筆調整" : "確認調整積分"}
              </Button>
              {adjustment.current && (
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    adjustment.current = null;
                    setError("");
                  }}
                >
                  取消重試
                </Button>
              )}
            </form>
          </section>
        </>
      )}
    </section>
  );
}
