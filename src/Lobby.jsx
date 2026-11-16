import { useState, useEffect, useCallback, useRef } from "react";
import {
  Compass,
  Sparkles,
  BookOpen,
  Map,
  Trophy,
  ArrowRight,
  Check,
  RefreshCw,
  History,
  Pencil,
} from "lucide-react";
import { Button, Field, Modal } from "./ui.jsx";
import { lazy, Suspense } from "react";
const ActivityAdmin = lazy(() => import("./ActivityAdmin.jsx"));
import "./activities.css";
const icons = { fortune: Sparkles, quiz: BookOpen, event: Map };
export const taiwanTime = (n) =>
  new Date(n).toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
export default function Lobby({
  data,
  request,
  onUnauthorized,
  onActivityChange,
}) {
  const [view, setView] = useState(data.activity || null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("lobby"),
    [selected, setSelected] = useState(null),
    [choice, setChoice] = useState(null),
    [result, setResult] = useState(null),
    [profile, setProfile] = useState(false),
    [history, setHistory] = useState({ rows: [], next: null }),
    [historyLoaded, setHistoryLoaded] = useState(false);
  const lock = useRef(false),
    pending = useRef(null);
  const handleError = useCallback(
    (e) => {
      setError(e.message);
      if (e.status === 401) onUnauthorized();
    },
    [onUnauthorized],
  );
  const refresh = useCallback(async () => {
    const v = await request("activity.state");
    setView(v);
    onActivityChange(v);
    return v;
  }, [request, onActivityChange]);
  useEffect(() => {
    if (data.activity) setView(data.activity);
  }, [data.activity]);
  useEffect(() => {
    let live = true;
    (data.activity ? Promise.resolve(data.activity) : request("activity.state"))
      .then((v) => {
        if (live) setView(v);
      })
      .catch((e) => {
        if (live) handleError(e);
      });
    const focus = () => {
      if (!lock.current) refresh().catch(handleError);
    };
    window.addEventListener("focus", focus);
    const timer = setInterval(focus, 60000);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [request, refresh, handleError]);
  const perform = async (type, payload) => {
    if (lock.current) return null;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      return await request(type, payload);
    } catch (e) {
      handleError(e);
      if (e.status === 409) refresh().catch(handleError);
      return null;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const loadHistory = async (more = false) => {
    const r = await perform(
      "activity.history",
      more ? { before: history.next } : {},
    );
    if (r) {
      setHistory((h) => ({
        rows: more ? [...h.rows, ...r.rows] : r.rows,
        next: r.next,
      }));
      setHistoryLoaded(true);
    }
  };
  const open = (a) => {
    pending.current = null;
    setError("");
    setSelected(a);
    setChoice(null);
    setResult(null);
  };
  const submit = async () => {
    if (!pending.current)
      pending.current = {
        submissionId: crypto.randomUUID(),
        activityId: selected.id,
        day: view.period.day,
        version: selected.version,
        ...(selected.content ? { contentId: selected.content.id, choice } : {}),
      };
    const r = await perform("activity.submit", pending.current);
    if (r) {
      setResult(r);
      pending.current = null;
      setHistoryLoaded(false);
      refresh().catch(handleError);
    }
  };
  if (!view)
    return (
      <section className="lobby-loading" aria-busy={!error}>
        <Compass size={42} />
        <h1>冒險大廳</h1>
        <p>{error || "正在準備今日的冒險…"}</p>
        {error && (
          <Button onClick={() => refresh().catch(handleError)}>重新載入</Button>
        )}
      </section>
    );
  const completed = view.activities.filter(
    (a) => a.used >= a.dailyLimit,
  ).length;
  return (
    <div className="guild-lobby">
      <header className="lobby-heading">
        <div>
          <span className="lobby-eyebrow">GUILD ADVENTURES</span>
          <h1>冒險大廳</h1>
        </div>
        <div className="lobby-date">
          {view.period.day}
          <span>台灣時間 · 每日 00:00 更新</span>
        </div>
      </header>
      <div className="tabs lobby-tabs">
        {[
          ["lobby", "活動大廳"],
          ["history", "我的冒險"],
          ...(data.me.admin ? [["manage", "活動管理"]] : []),
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            aria-pressed={tab === id}
            onClick={() => {
              setTab(id);
              setError("");
              if (id === "history" && !historyLoaded) loadHistory();
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
      {tab === "manage" ? (
        <Suspense fallback={<p>正在開啟活動管理…</p>}>
          <ActivityAdmin
            request={request}
            config={view.adminConfig}
            users={data.users}
            refresh={refresh}
            onUnauthorized={onUnauthorized}
          />
        </Suspense>
      ) : (
        <>
          {tab === "lobby" && (
            <section className="lobby-welcome">
              <div className="welcome-copy">
                <span className="lobby-eyebrow">
                  每一份參與，都讓公會更熱鬧
                </span>
                <h2>
                  嗨，{view.member.nickname || data.me.username}。<br />
                  今天，也來一場小冒險。
                </h2>
                <p>
                  不用等組隊，不必比裝備。幾分鐘的輕鬆時光，
                  <br className="desktop-break" />
                  和夥伴一起留下新的冒險故事。
                </p>
                <button
                  className="welcome-link"
                  onClick={() =>
                    document
                      .getElementById("daily-activities")
                      ?.scrollIntoView({ behavior: "smooth" })
                  }
                >
                  探索今日活動 <ArrowRight size={17} />
                </button>
              </div>
              <div className="welcome-emblem" aria-hidden="true">
                <Compass strokeWidth={0.8} />
                <span>YOUR NEXT ADVENTURE</span>
              </div>
            </section>
          )}
          <section className="adventure-stats" aria-label="我的活動統計">
            <div>
              <span>本週積分</span>
              <strong>
                {view.weekly}
                <small> 分</small>
              </strong>
            </div>
            <div>
              <span>累積積分</span>
              <strong>
                {view.member.total}
                <small> 分</small>
              </strong>
            </div>
            <div>
              <span>總參與次數</span>
              <strong>
                {view.member.count}
                <small> 次</small>
              </strong>
            </div>
            <div>
              <span>冒險者</span>
              <button
                className="nickname-button"
                onClick={() => setProfile(true)}
              >
                {view.member.nickname || data.me.username}
                <Pencil size={14} />
              </button>
              <small>設定遊戲暱稱</small>
            </div>
          </section>
          {tab === "lobby" ? (
            <div className="lobby-columns">
              <section id="daily-activities">
                <div className="lobby-section-title">
                  <h2>今日的小冒險</h2>
                  <span>
                    {completed} / {view.activities.length} 已完成
                  </span>
                </div>
                <div className="activity-list">
                  {view.activities.map((a) => {
                    const Icon = icons[a.type];
                    const done = a.used >= a.dailyLimit;
                    return (
                      <article
                        key={a.id}
                        className={`activity-card activity-${a.type}`}
                      >
                        <div className="activity-icon">
                          <Icon size={25} />
                        </div>
                        <div className="activity-body">
                          <span className="activity-duration">
                            {a.duration} · 每日 {a.dailyLimit} 次
                          </span>
                          <h3>{a.title}</h3>
                          <p>{a.description}</p>
                          <div className="activity-foot">
                            <span>
                              參與 +{a.points} 分
                              {a.bonus > 0 ? ` · 答對再 +${a.bonus} 分` : ""}
                            </span>
                            <Button
                              disabled={done || busy}
                              onClick={() => open(a)}
                            >
                              {done ? (
                                <>
                                  <Check size={15} />
                                  今日已完成
                                </>
                              ) : (
                                <>
                                  開始冒險 <ArrowRight size={15} />
                                </>
                              )}
                            </Button>
                          </div>
                          <small className="activity-remaining">
                            今日已參與 {a.used} 次
                          </small>
                        </div>
                      </article>
                    );
                  })}
                  {!view.activities.length && (
                    <p className="muted">活動正在準備中，稍後再回來看看。</p>
                  )}
                </div>
              </section>
              <aside className="weekly-board">
                <div className="lobby-section-title">
                  <h2>
                    <Trophy size={18} />
                    本週冒險榜
                  </h2>
                </div>
                <p className="board-subtitle">
                  從 {view.period.week} 起 · 週一 00:00 換週
                </p>
                {view.leaderboard.length ? (
                  <ol>
                    {view.leaderboard.map((row) => (
                      <li
                        key={row.memberId}
                        className={row.memberId === data.me.id ? "is-me" : ""}
                      >
                        <span className="rank">
                          {row.rank.toString().padStart(2, "0")}
                        </span>
                        <div>
                          <strong>
                            {row.name}
                            {row.memberId === data.me.id ? "（你）" : ""}
                          </strong>
                          <small>{row.count} 次參與</small>
                        </div>
                        <b>
                          {row.points}
                          <small> 分</small>
                        </b>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="board-empty">
                    <Trophy size={32} />
                    <p>本週的故事，等你開場。</p>
                    <small>完成活動後就會出現在這裡。</small>
                  </div>
                )}
                <p className="board-note">積分是參與的足跡，不是實力的排名。</p>
              </aside>
            </div>
          ) : (
            <section className="adventure-history">
              <div className="lobby-section-title">
                <h2>
                  <History size={19} />
                  我的冒險紀錄
                </h2>
                <Button disabled={busy} onClick={() => loadHistory()}>
                  <RefreshCw size={14} />
                  更新
                </Button>
              </div>
              <p className="muted">
                完整保留參與與積分調整，換週不會刪除紀錄。
              </p>
              {!historyLoaded ? (
                <p>正在讀取紀錄…</p>
              ) : !history.rows.length ? (
                <p className="history-empty">
                  還沒有冒險紀錄，從每日抽籤開始吧。
                </p>
              ) : (
                history.rows.map((r) => (
                  <article className="history-row" key={r.id}>
                    <span className="history-dot" />
                    <div>
                      <h3>{r.title}</h3>
                      <p>{r.summary}</p>
                      {r.resultDetails && (
                        <details>
                          <summary>查看結果</summary>
                          <p className="preserve-lines">{r.resultDetails}</p>
                        </details>
                      )}
                      <small>
                        {taiwanTime(r.createdAt)} ·{" "}
                        {r.kind === "adjustment" ? "管理員調整" : "活動參與"} ·
                        規則 v{r.version}
                      </small>
                    </div>
                    <strong className={r.delta < 0 ? "negative" : ""}>
                      {r.delta > 0 ? "+" : ""}
                      {r.delta}
                    </strong>
                  </article>
                ))
              )}
              {history.next && (
                <Button disabled={busy} onClick={() => loadHistory(true)}>
                  載入更多
                </Button>
              )}
            </section>
          )}
          <footer className="activity-notice">
            <div>
              <strong>把冒險延續到 Discord</strong>
              <p>
                分享今天的趣事，或向夥伴打聲招呼。本站僅記錄網站活動，不讀取
                Discord 聊天內容。
              </p>
            </div>
            {view.discordUrl ? (
              <a
                href={view.discordUrl}
                target="_blank"
                rel="noreferrer"
                className="discord-link"
              >
                前往公會 Discord <ArrowRight size={16} />
              </a>
            ) : (
              <small>管理員可在活動管理設定公會連結</small>
            )}
          </footer>
          <p className="activity-privacy">
            你的暱稱、本週積分與參與次數會顯示於榜單；管理員可查看活動紀錄。積分僅供參考，不是出團或福利資格的唯一標準。
          </p>
        </>
      )}
      {selected && (
        <Modal
          title={selected.title}
          onClose={() => {
            if (!busy) {
              setSelected(null);
              pending.current = null;
            }
          }}
        >
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {result ? (
            <div className="activity-result">
              <div className="result-points">
                +{result.delta}
                <small> 活動積分</small>
              </div>
              <h3>{result.summary}</h3>
              {result.resultDetails && (
                <p className="preserve-lines">{result.resultDetails}</p>
              )}
              <p className="muted">這次冒險已記錄到「我的冒險」。</p>
              <Button primary onClick={() => setSelected(null)}>
                完成冒險
              </Button>
            </div>
          ) : (
            <div className="activity-play">
              <p className="muted">
                每日 {selected.dailyLimit} 次 · 參與 +{selected.points} 分
                {selected.bonus ? `，答對另加 ${selected.bonus} 分` : ""}
              </p>
              {selected.type === "fortune" ? (
                <>
                  <Sparkles size={52} />
                  <h3>今天，會遇見什麼好事？</h3>
                  <p>輕輕抽一張籤，帶著好心情出發。</p>
                </>
              ) : (
                <>
                  <h3>
                    {selected.content?.question || selected.content?.title}
                  </h3>
                  {selected.content?.story && <p>{selected.content.story}</p>}
                  {selected.content?.category && (
                    <p className="muted">
                      {selected.content.category} ·{" "}
                      {selected.content.difficulty}
                    </p>
                  )}
                  <div className="activity-options">
                    {selected.content?.options.map((o, i) => (
                      <button
                        key={i}
                        disabled={busy || !!pending.current}
                        className={choice === i ? "selected" : ""}
                        aria-pressed={choice === i}
                        onClick={() => setChoice(i)}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <Button
                primary
                disabled={
                  busy || (selected.type !== "fortune" && choice === null)
                }
                onClick={submit}
              >
                {busy
                  ? "正在記錄…"
                  : pending.current
                    ? "重試同一筆提交"
                    : selected.type === "fortune"
                      ? "抽出今日冒險籤"
                      : "送出選擇"}
              </Button>
            </div>
          )}
        </Modal>
      )}
      {profile && (
        <Modal title="設定遊戲暱稱" onClose={() => setProfile(false)}>
          <p className="muted">
            請使用夥伴認得的遊戲暱稱。積分綁定帳號，改名不影響歷史紀錄；同名成員仍是不同帳號。
          </p>
          {error && <p className="error">{error}</p>}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await perform("activity.profile", {
                nickname: new FormData(e.currentTarget).get("nickname"),
              });
              if (r) {
                setProfile(false);
                refresh().catch(handleError);
              }
            }}
          >
            <Field
              label="遊戲暱稱"
              name="nickname"
              maxLength={30}
              required
              defaultValue={view.member.nickname || data.me.username}
            />
            <Button primary disabled={busy}>
              儲存暱稱
            </Button>
          </form>
        </Modal>
      )}
    </div>
  );
}
