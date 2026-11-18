import { useStarRewards, STAR_ASSET } from "./StarRewards.jsx";
import { notify, useFeedback } from "./FeedbackHost.jsx";
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
    [profile, setProfile] = useState(false);
  const { hold, collect } = useStarRewards();
  const finishReward = (event) => {
    const button =
      event?.currentTarget || document.querySelector(".star-collect");
    collect(button?.getBoundingClientRect());
    setSelected(null);
    pending.current = null;
  };
  useFeedback(error);
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
        day: selected.day || view.period.day,
        version: selected.version,
        ...(selected.content ? { contentId: selected.content.id, choice } : {}),
      };
    const r = await perform("activity.submit", pending.current);
    if (r) {
      hold(r);
      setResult(r);
      pending.current = null;
      refresh().catch(handleError);
    }
  };
  if (!view)
    return (
      <section className="lobby-loading">
        <h1>冒險大廳</h1>
        <p>{error || "正在讀取活動…"}</p>
        {error && (
          <Button onClick={() => refresh().catch(handleError)}>重新載入</Button>
        )}
      </section>
    );
  const completed = view.activities.filter(
    (a) => a.used >= a.dailyLimit,
  ).length;
  return (
    <div className="guild-lobby compact-lobby">
      <header className="lobby-heading">
        <div>
          <h1>冒險大廳</h1>
          <p className="welcome-short">
            {view.member.nickname || data.me.username}，歡迎回來。
          </p>
        </div>
        <div className="lobby-date">
          {view.period.day}
          <span>所有小遊戲每日 09:00 更新（台灣時間）</span>
        </div>
      </header>
      <div className="tabs lobby-tabs" data-tour="lobby-tabs">
        {[
          ["lobby", "活動大廳"],
          ["summary", "我的冒險"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            aria-pressed={tab === id}
            onClick={() => {
              setTab(id);
              setError("");
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
      <div className="view-transition" key={tab}>
        <section
          className="adventure-stats"
          data-tour="stats"
          aria-label="我的活動統計"
        >
          <div>
            <span>本週星星</span>
            <strong>
              {view.weekly}
              <small> 顆星星</small>
            </strong>
          </div>
          <div>
            <span>累積星星</span>
            <strong>
              {view.member.total}
              <small> 顆星星</small>
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
            <span>遊戲暱稱</span>
            <button
              className="nickname-button"
              onClick={() => setProfile(true)}
            >
              {view.member.nickname || data.me.username}
              <Pencil size={14} />
            </button>
          </div>
        </section>
        {tab === "lobby" ? (
          <div className="lobby-columns">
            <section id="daily-activities" data-tour="activities">
              <div className="lobby-section-title">
                <h2>今日的小冒險</h2>
                <span>
                  {completed} / {view.activities.length} 已完成
                </span>
              </div>
              <div className="activity-list">
                {view.activities.map((a) => {
                  const Icon = icons[a.type],
                    done = a.used >= a.dailyLimit;
                  return (
                    <article
                      key={a.id}
                      className={`activity-card activity-${a.type}`}
                    >
                      <div className="activity-icon">
                        <Icon size={22} />
                      </div>
                      <div className="activity-body">
                        <h3>{a.title}</h3>
                        <p>{a.description}</p>
                        <div className="activity-foot">
                          <span>
                            {a.duration} · 參與 +{a.points} 顆星星
                            {a.bonus ? `，答對 +${a.bonus}` : ""}
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
                                開始冒險
                                <ArrowRight size={15} />
                              </>
                            )}
                          </Button>
                        </div>
                        <small className="activity-remaining">
                          本日 {a.used} / {a.dailyLimit} 次 · 每日 09:00 更新
                        </small>
                      </div>
                    </article>
                  );
                })}
                {!view.activities.length && (
                  <p className="muted">目前沒有開放的活動。</p>
                )}
              </div>
            </section>
            <aside className="weekly-board" data-tour="leaderboard">
              <div className="lobby-section-title">
                <h2>
                  <Trophy size={18} />
                  本週星星
                </h2>
              </div>
              <p className="board-subtitle">
                {view.period.week} 起 · 週一 00:00 換週
              </p>
              {view.leaderboard.length ? (
                <ol>
                  {view.leaderboard.map((row) => (
                    <li
                      key={row.memberId}
                      className={row.memberId === data.me.id ? "is-me" : ""}
                    >
                      <span className="rank">{row.rank}</span>
                      <div>
                        <strong>
                          {row.name}
                          {row.memberId === data.me.id ? "（你）" : ""}
                        </strong>
                        <small>{row.count} 次參與</small>
                      </div>
                      <b>
                        {row.points}
                        <small> 顆星星</small>
                      </b>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="muted">本週尚無參與紀錄。</p>
              )}
              <p className="board-note">星星僅供活動參考。</p>
            </aside>
          </div>
        ) : (
          <section className="summary-panel">
            <h2>本週概況</h2>
            <p>
              快問快答累積：
              <strong>{view.member.quizStats?.points || 0} 顆星星</strong> ·
              已答 {view.member.quizStats?.count || 0} 題 · 答對{" "}
              {view.member.quizStats?.correct || 0} 題
            </p>
            <dl>
              <div>
                <dt>本週參與</dt>
                <dd>{view.weeklyCount} 次</dd>
              </div>
              <div>
                <dt>今天已完成</dt>
                <dd>
                  {completed} / {view.activities.length} 項
                </dd>
              </div>
              <div>
                <dt>最近參與</dt>
                <dd>
                  {view.member.lastAt
                    ? taiwanTime(view.member.lastAt)
                    : "尚未參與"}
                </dd>
              </div>
            </dl>
            <p className="muted">
              僅顯示星星與參與摘要，不再保存一份個人逐筆歷史。累積星星不會因換週而清除。
            </p>
          </section>
        )}
      </div>
      <footer className="lobby-footer">
        <small>成員可看本週榜單；管理員可查最近 35 天的活動明細。</small>
        {view.discordUrl && (
          <a
            className="discord-link"
            href={view.discordUrl}
            target="_blank"
            rel="noreferrer"
          >
            公會 Discord <ArrowRight size={14} />
          </a>
        )}
      </footer>
      {selected && (
        <Modal
          title={selected.title}
          onClose={() => {
            if (!busy) {
              if (result) finishReward();
              else {
                setSelected(null);
                pending.current = null;
              }
            }
          }}
        >
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {result ? (
            <div className="star-reward-card">
              <div className="star-emblem" aria-hidden="true">
                <img src={STAR_ASSET} alt="" width="126" height="126" />
              </div>
              <svg
                className="reward-laurels"
                viewBox="0 0 320 100"
                aria-hidden="true"
              >
                {[false, true].map((mirror) => (
                  <g
                    key={String(mirror)}
                    transform={
                      mirror ? "translate(320 0) scale(-1 1)" : undefined
                    }
                  >
                    <path
                      d="M108 92 Q42 75 36 8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <g
                        key={i}
                        transform={`translate(${38 + i * i * 1.8} ${18 + i * 12}) rotate(${-22 + i * 8})`}
                      >
                        <ellipse
                          cx="-7"
                          cy="-3"
                          rx="4"
                          ry="11"
                          transform="rotate(-35)"
                        />
                        <ellipse
                          cx="7"
                          cy="-5"
                          rx="4"
                          ry="11"
                          transform="rotate(35)"
                        />
                      </g>
                    ))}
                  </g>
                ))}
              </svg>
              <div className="star-earned">
                <strong>+{result.delta}</strong>
                <span>顆星星</span>
              </div>
              <div className="star-reward-story">
                <h3>{result.summary}</h3>
                {result.resultDetails && <p>{result.resultDetails}</p>}
              </div>
              <p className="star-reward-note">
                星星已記入帳號，確認後飛入右上角。
              </p>
              <button
                type="button"
                className="star-collect"
                onClick={finishReward}
              >
                確認收下星星
              </button>
            </div>
          ) : (
            <div className="activity-play">
              <p className="muted">
                每日 {selected.dailyLimit} 次 · 參與 +{selected.points} 顆星星
                {selected.bonus ? `，答對另加 ${selected.bonus} 顆星星` : ""}
              </p>
              {selected.type === "fortune" ? (
                <>
                  <Sparkles size={52} />
                  <h3>{selected.content?.intro}</h3>
                  <p>{selected.content?.body}</p>
                </>
              ) : (
                <>
                  <h3>
                    {selected.content?.question || selected.content?.title}
                  </h3>
                  {selected.content?.story && <p>{selected.content.story}</p>}
                  {selected.content?.category && (
                    <p className="muted">{selected.content.category}</p>
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
            請使用夥伴認得的遊戲暱稱。星星綁定帳號，改名不影響歷史紀錄；同名成員仍是不同帳號。
          </p>
          {error && <p className="error">{error}</p>}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await perform("activity.profile", {
                nickname: new FormData(e.currentTarget).get("nickname"),
              });
              if (r) {
                notify("遊戲暱稱已儲存");
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
