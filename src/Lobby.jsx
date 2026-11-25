import { encounterMotion } from "./encounterMotion.js";
import { useStarRewards, STAR_ASSET } from "./StarRewards.jsx";
import Aquarium from "./Aquarium.jsx";
import useSubmitDialog from "./useSubmitDialog.js";
import { playSound } from "./sounds.js";
import { notify, useFeedback } from "./FeedbackHost.jsx";
import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
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
function resultSound(record) {
  if (record.delta < 0) return "penalty";
  if (record.quizCorrect === false) return "smallGain";
  if (record.delta === 0) return "unchanged";
  if (record.quizCorrect === true || record.outcomeTier === "high")
    return "jackpot";
  if (record.outcomeTier === "low") return "smallGain";
  return "steady";
}
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
  mutate,
  isSaving,
}) {
  const [view, setView] = useState(data.activity || null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("lobby"),
    [selected, setSelected] = useState(null),
    [encounterPhase, setEncounterPhase] = useState("waiting"),
    [choice, setChoice] = useState(null),
    [inEncounter, setInEncounter] = useState(false),
    [result, setResult] = useState(null);
  const profile = useSubmitDialog();
  const { hold, collect, release } = useStarRewards();
  const rewardEmblem = useRef(null);
  const heldReward = useRef(null);
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (heldReward.current) release(heldReward.current);
    };
  }, [data.me.id, release]);
  const collectReward = () => {
    if (result) collect(result.id, rewardEmblem.current);
  };
  const finishReward = () => {
    collectReward();
    setSelected(null);
    pending.current = null;
  };
  useFeedback(error);
  const lock = useRef(false),
    pending = useRef(null),
    settledView = useRef(null),
    viewRequest = useRef(0),
    lastPrivateRefresh = useRef(Date.now());
  const handleError = useCallback(
    (e) => {
      setError(e.message);
      if (e.status === 401) onUnauthorized();
    },
    [onUnauthorized],
  );
  const refresh = useCallback(async () => {
    const sequence = ++viewRequest.current;
    const v = await request("activity.state");
    if (sequence === viewRequest.current) {
      lastPrivateRefresh.current = Date.now();
      setView(v);
      onActivityChange(v);
    }
    return v;
  }, [request, onActivityChange]);
  useEffect(() => {
    let live = true;
    if (data.activity) {
      setView(data.activity);
    } else {
      setView(null);
      refresh().catch((e) => {
        if (live) handleError(e);
      });
    }
    return () => {
      live = false;
      viewRequest.current++;
    };
  }, [data.activity, refresh, handleError]);
  useEffect(() => {
    let live = true, pending = false;
    let last = Date.now();
    const focus = async () => {
      if (pending || lock.current || document.hidden || !data.activity || Date.now() - last < 60000) return;
      pending = true;
      last = Date.now();
      const version = viewRequest.current;
      try {
        if (Date.now() - lastPrivateRefresh.current >= 15 * 60000) {
          await refresh();
          return;
        }
        const summary = await request("activity.summary");
        if (!live || version !== viewRequest.current || lock.current) return;
        const previous = data.activity;
        if (summary.day !== previous.aquarium.day || summary.period.day !== previous.period.day) {
          await refresh();
          return;
        }
        const total = Math.max(previous.aquarium.totalCheckIns, summary.totalCheckIns);
        onActivityChange({ ...previous, leaderboard: summary.leaderboard,
          aquarium: { ...previous.aquarium, totalCheckIns: total, fishCount: Math.min(previous.aquarium.capacity, total) } });
      } catch (e) {
        if (live) handleError(e);
      } finally { pending = false; }
    };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    const timer = setInterval(focus, 120000);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [data.activity, refresh, request, onActivityChange, handleError]);
  useEffect(() => {
    const day = view?.aquarium?.day;
    if (!day) return;
    const nextReset = Date.parse(day + "T09:00:00+08:00") + 86400000;
    const timer = setTimeout(() => refresh().catch(handleError), Math.max(0, nextReset - Date.now()) + 150);
    return () => clearTimeout(timer);
  }, [view?.aquarium?.day, refresh, handleError]);
  const perform = async (type, payload) => {
    if (lock.current) return null;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      return await request(type, payload);
    } catch (e) {
      handleError(e);
      if (e.status === 409) {
        pending.current = null;
        setSelected(null);
        refresh().catch(handleError);
      }
      return null;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const open = (a) => {
    if (heldReward.current) {
      release(heldReward.current);
      heldReward.current = null;
    }
    profile.close();
    settledView.current = null;
    pending.current = null;
    setError("");
    setMotion(encounterMotion() === "full" || !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "full" : "reduced");
    setEncounterPhase("waiting");
    setInEncounter(false);
    setSelected(a);
    setChoice(null);
    setResult(null);
  };
  const [checkingDay, setCheckingDay] = useState(null);
  const checkInFlight = useRef(null);
  const checkIn = async () => {
    const { day, checkedInToday } = view.aquarium;
    if (checkedInToday || checkInFlight.current) return;
    checkInFlight.current = day;
    setCheckingDay(day);
    try {
      const aquarium = await request("aquarium.checkIn", { day });
      ++viewRequest.current;
      onActivityChange(current => current?.aquarium.day === day
        ? { ...current, aquarium } : current);
      notify("今日簽到完成");
    } catch (e) {
      if (e.status === 401) onUnauthorized();
      if (mounted.current && (e.status === 409 || !e.status || e.status >= 500))
        refresh().catch(handleError);
    } finally {
      checkInFlight.current = null;
      if (mounted.current) setCheckingDay(null);
    }
  };
  const continueAdventure = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    collectReward();
    try {
      const updated = await (settledView.current || refresh());
      if (!updated) return;
      const next = updated.activities.find((a) => a.id === selected.id);
      if (next?.content && (next.unlimited || next.used < next.dailyLimit)) {
        open(next);
      } else {
        setSelected(null);
        notify("本次冒險已完成");
      }
    } catch (e) {
      handleError(e);
    } finally {
      settledView.current = null;
      lock.current = false;
      setBusy(false);
    }
  };
  const [motion, setMotion] = useState("system");
  const hasEncounter = selected?.content?.extraIndex >= 0;
  const revealing = hasEncounter && encounterPhase !== "ready";
  useEffect(() => {
    if (result || !hasEncounter) return;
    const warning = setTimeout(() => {
      setEncounterPhase("warning");
      playSound("reveal");
    }, 500);
    const opening = setTimeout(
      () => setEncounterPhase("opening"),
      1350,
    );
    const ready = setTimeout(() => setEncounterPhase("ready"), 2130);
    return () => {
      clearTimeout(warning);
      clearTimeout(opening);
      clearTimeout(ready);
    };
  }, [selected, result, hasEncounter]);
  const submit = async () => {
    if (revealing) return;
    const index = inEncounter ? selected.content.extraIndex : choice;
    if (!pending.current)
      pending.current = {
        submissionId: crypto.randomUUID(),
        activityId: selected.id,
        day: selected.day || view.period.day,
        version: selected.version,
        round: selected.used,
        ...(selected.content
          ? { contentId: selected.content.id, choice: index }
          : {}),
        ...(selected.type === "event"
          ? {
              choiceKey: selected.content.choiceKeys?.[index],
              bonus: inEncounter,
            }
          : {}),
      };
    const r = await perform("activity.submit", pending.current);
    if (r && r.memberId === data.me.id) {
      if (!mounted.current) {
        // The server may have committed while the member left the lobby.
        // Invalidate this session's view so the next visit loads the result.
        onActivityChange(null);
        return;
      }
      playSound(resultSound(r));
      heldReward.current = r.id;
      hold(r);
      setResult(r);
      pending.current = null;
      settledView.current = refresh().catch((e) => {
        settledView.current = null;
        handleError(e);
        return null;
      });
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
    (a) => a.finished || (!a.unlimited && a.used >= a.dailyLimit),
  ).length;
  const canContinue = selected?.unlimited || (selected?.campaign &&
    selected.used + 1 < selected.dailyLimit &&
    selected.campaign.progress + 1 < selected.campaign.chapters);
  return (
    <div className="guild-lobby compact-lobby">
      <header className="lobby-heading">
        <div>
          <h1>冒險大廳</h1>
          <p className="welcome-short">
            {data.me.nickname || view.member.nickname || data.me.username}
            ，歡迎回來。
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
        {tab === "lobby" && (
          <Aquarium memberId={data.me.id} aquarium={checkingDay === view.aquarium.day && !view.aquarium.checkedInToday
            ? { ...view.aquarium, checking: true, checkedInToday: true, totalCheckIns: view.aquarium.totalCheckIns + 1,
                fishCount: Math.min(view.aquarium.capacity, view.aquarium.fishCount + 1) }
            : view.aquarium} onCheckIn={checkIn} busy={busy} />
        )}
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
              onClick={() => profile.open({ nickname: data.me.nickname || view.member.nickname || data.me.username })}
            >
              {data.me.nickname || view.member.nickname || data.me.username}
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
                    done = a.finished || (!a.unlimited && a.used >= a.dailyLimit);
                  return (
                    <article
                      key={a.id}
                      className={`activity-card activity-${a.type}`}
                    >
                      <div className="activity-icon">
                        <Icon size={22} />
                      </div>
                      <div className="activity-body">
                        <h3>{a.campaign?.title || a.title}</h3>
                        <p>{a.campaign ? `劇本進度 · 已完成 ${a.campaign.progress} / ${a.campaign.chapters} 話` : a.description}</p>
                        <div className="activity-foot">
                          <span>
                            {a.duration} ·{" "}
                            {a.type === "event"
                              ? "依選擇結果增減星星"
                              : `參與 +${a.points} 顆星星`}
                            {a.bonus ? `，答對 +${a.bonus}` : ""}
                          </span>
                          <Button
                            disabled={done || busy}
                            onClick={() => open(a)}
                          >
                            {done ? (
                              <>
                                <Check size={15} />
                                {a.finished ? "劇本已通關" : "今日已完成"}
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
                          {a.unlimited
                            ? `測試中 · 今日已玩 ${a.used} 次`
                            : `本日 ${a.used} / ${a.dailyLimit} 次 · 每日 09:00 更新`}
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
                          {(row.memberId === data.me.id && data.me.nickname) || row.name}
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
          className={
            selected.type === "event"
              ? `activity-modal adventure-modal motion-${motion}`
              : "activity-modal"
          }
          title={inEncounter ? "機遇獎勵關卡" : selected.campaign?.title || selected.title}
          onClose={() => {
            if (!busy) {
              if (result?.bonus) continueAdventure();
              else if (inEncounter && !result && !pending.current)
                setInEncounter(false);
              else if (result) finishReward();
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
                <img key={result.id} ref={rewardEmblem} src={STAR_ASSET} alt="" width="126" height="126" />
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
                <strong>
                  {result.delta > 0 ? "+" : ""}
                  {result.delta}
                </strong>
                <span>顆星星</span>
              </div>
              <div className="star-reward-story">
                <h3>{result.summary}</h3>
                {result.resultDetails && <p>{result.resultDetails}</p>}
              </div>
              <p className="star-reward-note">
                {result.delta > 0
                  ? "星星已記入帳號，確認後飛入右上角。"
                  : result.delta < 0
                    ? `確認後，右上角會掉落 ${Math.abs(result.delta)} 顆星星。`
                    : `目前累積 ${result.after} 顆星星。`}
              </p>
              <div
                className={
                  canContinue || result.bonus
                    ? "adventure-result-actions"
                    : undefined
                }
              >
                <button
                  type="button"
                  className="star-collect"
                  data-own-sound={result.delta > 0 ? true : undefined}
                  disabled={busy}
                  onClick={
                    result.bonus || canContinue
                      ? continueAdventure
                      : finishReward
                  }
                >
                  {result.bonus
                    ? "返回本話，繼續選擇"
                    : canContinue
                      ? busy
                        ? "讀取下一話…"
                        : result.delta > 0
                          ? "收下星星，繼續冒險"
                          : "繼續冒險"
                      : result.delta > 0
                        ? "確認收下星星"
                        : "確認結果"}
                  {canContinue && (
                    <ArrowRight size={16} aria-hidden="true" />
                  )}
                </button>
                {canContinue && (
                  <button
                    type="button"
                    className="adventure-return"
                    data-own-sound={result.delta > 0 ? true : undefined}
                    disabled={busy}
                    onClick={finishReward}
                  >
                    回到大廳
                  </button>
                )}
              </div>
            </div>
          ) : inEncounter ? (
            <div className="encounter-challenge">
              <p className="encounter-chapter">{selected.content.title}</p>
              <h3>{selected.content.options[selected.content.extraIndex]}</h3>
              <p>
                每回合限挑戰一次。機遇會另外結算星星，之後回到本話選擇原本的行動。
              </p>
              <ul aria-label="機遇挑戰可能結果">
                {selected.content.odds?.[selected.content.extraIndex]?.map(
                  ({ chance, stars }, i) => (
                    <li key={i}>
                      <span>{chance}%</span>
                      <strong>
                        {stars < 0 ? "扣除" : "獲得"} {Math.abs(stars)} 星
                      </strong>
                    </li>
                  ),
                )}
              </ul>
              <div className="encounter-challenge-actions">
                <Button primary disabled={busy} onClick={submit}>
                  {busy
                    ? "挑戰中…"
                    : pending.current
                      ? "重試同一次挑戰"
                      : "接受挑戰"}
                </Button>
                <Button
                  disabled={busy || !!pending.current}
                  onClick={() => setInEncounter(false)}
                >
                  返回原選項
                </Button>
              </div>
            </div>
          ) : (
            <div className="activity-play">
              <p className="muted">
                {selected.unlimited
                  ? "測試期間不限次數"
                  : `每日 ${selected.dailyLimit} 次`}{" "}
                ·{" "}
                {selected.type === "event"
                  ? "依選擇結果增減星星"
                  : `參與 +${selected.points} 顆星星`}
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
                  <div
                    className="activity-options"
                    data-encounter={hasEncounter ? encounterPhase : undefined}
                  >
                    {selected.content?.options.map((o, i) => {
                      const extra = selected.content.extraIndex === i;
                      const option = (
                        <button
                          key={i}
                          data-own-sound
                          disabled={
                            busy ||
                            !!pending.current ||
                            (revealing &&
                              (extra || encounterPhase !== "waiting"))
                          }
                          className={`${choice === i ? "selected" : ""} ${extra ? "event-extra" : ""}`}
                          aria-pressed={extra ? undefined : choice === i}
                          onClick={() => {
                            if (choice !== i)
                              playSound(extra ? "chooseExtra" : "choose");
                            if (extra) setInEncounter(true);
                            else setChoice(i);
                          }}
                        >
                          {extra && (
                            <small className="event-extra-label">
                              <Sparkles size={13} aria-hidden="true" />{" "}
                              意外的機遇 · 額外挑戰
                            </small>
                          )}
                          <span className="adventure-choice-label">{o}</span>
                          {extra && (
                            <ArrowRight
                              className="event-enter-arrow"
                              size={18}
                              aria-hidden="true"
                            />
                          )}
                          {selected.content.odds?.[i] && (
                            <small className="event-odds">
                              {selected.content.odds[i].map(
                                ({ chance, stars }, index) => (
                                  <span
                                    key={index}
                                    className={`adventure-odds-item${stars < 0 ? " adventure-odds-loss" : ""}`}
                                  >
                                    <span>{chance}%</span>{" "}
                                    <strong>
                                      {stars > 0 ? "+" : ""}
                                      {stars} 星
                                    </strong>
                                  </span>
                                ),
                              )}
                            </small>
                          )}
                        </button>
                      );
                      return extra ? (
                        <div className="event-rift" key={i}>
                          <span className="event-warning" role="status">
                            {encounterPhase === "warning"
                              ? "可能出現意外的機遇！"
                              : ""}
                          </span>
                          <div
                            className="event-rift-slot"
                            aria-hidden={revealing}
                          >
                            <div className="event-rift-card">{option}</div>
                          </div>
                        </div>
                      ) : (
                        option
                      );
                    })}
                  </div>
                </>
              )}
              <Button
                primary
                disabled={
                  busy ||
                  revealing ||
                  (selected.type !== "fortune" && choice === null)
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
      {profile.draft && (
        <Modal title="設定遊戲暱稱" onClose={profile.close}>
          <p className="muted">
            請使用夥伴認得的遊戲暱稱。星星綁定帳號，改名不影響歷史紀錄；同名成員仍是不同帳號。
          </p>
          {error && <p className="error">{error}</p>}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await profile.submit((payload) => mutate("profile.nickname", payload, "遊戲暱稱已儲存"));
            }}
          >
            <Field
              label="遊戲暱稱"
              name="nickname"
              maxLength={30}
              required
              value={profile.draft.nickname}
              onChange={(e) => profile.setDraft({ nickname: e.target.value })}
            />
            <Button primary disabled={isSaving("profile.nickname", profile.draft)}>
              儲存暱稱
            </Button>
          </form>
        </Modal>
      )}
    </div>
  );
}
