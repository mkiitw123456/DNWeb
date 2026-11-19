import { wheelProgress } from "./wheel-motion.js";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Button, Field, Modal } from "./ui.jsx";
import { notify } from "./FeedbackHost.jsx";
import "./casino.css";
import GuildGames from "./GuildGames.jsx";
import Duels from "./Duels.jsx";

const time = (value) =>
  new Date(value).toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    hour12: false,
  });
const colors = [
  "#6366b1",
  "#267f94",
  "#947149",
  "#4e846d",
  "#8a628b",
  "#466d9d",
  "#a26062",
  "#6c7c42",
];
const Wheel = memo(function Wheel({ room, clockOffset, onComplete }) {
  const ref = useRef();
  const members =
    room.status === "drawn"
      ? room.eligible
      : room.entries.filter((e) => e.status === "approved");
  const count = members.length;
  const gradient = count
    ? members
        .map(
          (_, i) =>
            `${colors[i % colors.length]} ${(i * 360) / count}deg ${((i + 1) * 360) / count}deg`,
        )
        .join(",")
    : "var(--surface), var(--surface)";
  const winner = members.findIndex((e) => e.userId === room.winnerId);
  const {
    turns,
    duration,
    offset: landing,
    acceleration,
    cruise = 0.12,
    startsAt: animationStart,
  } = room.spin || {};
  useEffect(() => {
    if (!duration || !ref.current || count === 0 || winner < 0) return;
    const element = ref.current;
    const total = turns * 360 + 360 - ((winner + landing) * 360) / count;
    // Capture server alignment once. Polling and system-clock corrections must
    // never seek or restart an animation already in progress.
    const elapsedAtStart =
      Date.now() + clockOffset.current - (animationStart ?? room.settledAt);
    const start = performance.now();
    let frame;
    element.classList.add("is-spinning");
    function animate(timestamp) {
      const t = Math.max(
        0,
        Math.min(1, (elapsedAtStart + timestamp - start) / duration),
      );
      element.style.transform = `rotate(${total * wheelProgress(t, acceleration, cruise)}deg)`;
      if (t < 1) frame = requestAnimationFrame(animate);
      else {
        element.classList.remove("is-spinning");
        onComplete(room.id + ":" + room.settledAt);
      }
    }
    animate(start);
    return () => {
      cancelAnimationFrame(frame);
      element.classList.remove("is-spinning");
    };
  }, [
    room.id,
    room.settledAt,
    winner,
    count,
    turns,
    duration,
    landing,
    acceleration,
    cruise,
    animationStart,
    clockOffset,
    onComplete,
  ]);
  return (
    <div
      className="prize-wheel-wrap"
      aria-label={
        count ? `抽獎轉盤，${count} 位合格參加者，機率相同` : "等待合格參加者"
      }
    >
      <span className="prize-pointer" aria-hidden="true" />
      <div
        className="prize-wheel"
        ref={ref}
        style={{ background: `conic-gradient(${gradient})` }}
        aria-hidden="true"
      >
        <i className="prize-wheel-marker" aria-hidden="true" />
        {members.map((m, i) => {
          const angle = ((i + 0.5) * Math.PI * 2) / count;
          return (
            <span
              key={m.userId}
              style={{
                left: `${50 + 33 * Math.sin(angle)}%`,
                top: `${50 - 33 * Math.cos(angle)}%`,
              }}
              title={m.name}
            >
              {count <= 20 ? m.name : i + 1}
            </span>
          );
        })}
      </div>
      <span className="prize-wheel-center" aria-hidden="true">
        ✦
      </span>
    </div>
  );
});
export default function Casino({ me, request, onUnauthorized }) {
  const [tab, setTab] = useState("pool"),
    [state, setState] = useState(null),
    [error, setError] = useState("");
  const [creating, setCreating] = useState(false),
    [selected, setSelected] = useState(null),
    [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(""),
    [startsAt, setStartsAt] = useState("");
  const [clock, setClock] = useState(Date.now());
  const [completedDraw, setCompletedDraw] = useState(null);
  const offset = useRef(0),
    sequence = useRef(0),
    lock = useRef(false);
  const linked = /^\d{17,20}$/.test(me.discordId || "");
  const refresh = useCallback(async () => {
    const seq = ++sequence.current;
    const next = await request("casino.state");
    if (seq === sequence.current) {
      offset.current = next.serverNow - Date.now();
      setState(next);
      setError("");
    }
  }, [request]);
  useEffect(() => {
    if (!linked || !["pool", "history"].includes(tab)) return;
    let live = true,
      pending = false;
    const poll = async () => {
      if (pending || lock.current || !live) return;
      pending = true;
      try {
        await refresh();
      } catch (e) {
        if (live) {
          setError(e.message);
          if (e.status === 401) onUnauthorized();
        }
      } finally {
        pending = false;
      }
    };
    poll();
    const timer = setInterval(poll, 2000);
    const clockTimer = setInterval(() => setClock(Date.now()), 250);
    return () => {
      live = false;
      sequence.current++;
      clearInterval(timer);
      clearInterval(clockTimer);
    };
  }, [linked, refresh, onUnauthorized, tab]);
  async function act(type, payload) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    sequence.current++;
    try {
      const next = await request(type, payload);
      offset.current = next.serverNow - Date.now();
      setState(next);
      setError("");
      notify(
        type === "casino.join"
          ? "已申請加入，等待房主審核"
          : type === "casino.review"
            ? "已更新審核結果"
            : "獎池已建立",
      );
      return true;
    } catch (e) {
      notify(e.message, "error");
      if (e.status === 401) onUnauthorized();
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const now = clock + offset.current;
  const rooms = state?.rooms || [],
    room = rooms.find((r) => r.id === selected);
  const drawing =
    room?.spin && completedDraw !== room.id + ":" + room.settledAt;
  const ownEntry = room?.entries.find((e) => e.userId === me.id);
  const status = (r) =>
    r.status === "open"
      ? "開放報名"
      : r.status === "cancelled"
        ? "已取消"
        : now < (r.spin.startsAt ?? r.settledAt) + r.spin.duration
          ? "開獎中"
          : "已結算";
  if (!linked)
    return (
      <section className="admin-panel">
        <h1>賭場</h1>
        <p>請先到設定完成 Discord 身分綁定，並等待管理員審核後使用公會抽獎。</p>
      </section>
    );
  return (
    <section className="casino">
      <header className="casino-heading">
        <div>
          <h1>賭場</h1>
          <p className="muted">公會遊戲 · 房主人工審核 · 台灣時間</p>
        </div>
        {tab === "pool" && (
          <Button primary onClick={() => setCreating(true)}>
            建立獎池
          </Button>
        )}
      </header>
      <nav className="tabs">
        {[
          ["pool", "獎池"],
          ["duel", "對賭"],
          ["prediction", "預測"],
          ["race", "賽馬"],
          ["history", "歷史紀錄"],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={tab === id ? "active" : ""}
          >
            {label}
          </button>
        ))}
      </nav>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {state && !state.webhookConfigured && (
        <p className="hint">
          尚未設定抽獎 Webhook，Discord 通知暫時無法傳送，請管理員至後台設定。
        </p>
      )}
      {tab === "duel" ? (
        <Duels me={me} request={request} onUnauthorized={onUnauthorized} />
      ) : tab === "prediction" || tab === "race" ? (
        <GuildGames
          key={tab}
          kind={tab === "race" ? "race" : "prediction"}
          me={me}
          request={request}
          onUnauthorized={onUnauthorized}
        />
      ) : (
        <>
          {tab === "history" && (
            <p className="muted">
              已結算紀錄保留至下一個台灣時間 09:00，進行中的獎池不會被清除。
            </p>
          )}
          {!state && !error && <p>正在讀取獎池…</p>}
          <div className="prize-list">
            {rooms
              .filter((r) =>
                tab === "history"
                  ? r.status !== "open"
                  : r.status === "open" ||
                    (r.spin &&
                      now < (r.spin.startsAt ?? r.settledAt) + r.spin.duration),
              )
              .map((r) => (
                <article className="prize-card" key={r.id}>
                  <small>{status(r)}</small>
                  <h2>{r.title}</h2>
                  <p>房主：{r.ownerName}</p>
                  <p>{time(r.startsAt)} 開獎</p>
                  <p className="muted">
                    {r.entries.filter((e) => e.status === "approved").length}{" "}
                    人已確認
                  </p>
                  <Button onClick={() => setSelected(r.id)}>
                    觀看{r.status === "open" ? "／報名" : "結果"}
                  </Button>
                </article>
              ))}
          </div>
          {state &&
            !rooms.some((r) =>
              tab === "history"
                ? r.status !== "open"
                : r.status === "open" ||
                  (r.spin &&
                    now < (r.spin.startsAt ?? r.settledAt) + r.spin.duration),
            ) && (
              <p className="muted">
                目前沒有{tab === "history" ? "歷史紀錄" : "開放中的獎池"}。
              </p>
            )}
        </>
      )}
      {creating && (
        <Modal
          title="建立獎池"
          onClose={() => {
            if (!busy) setCreating(false);
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await act("casino.create", {
                  title,
                  startsAt: startsAt + ":00+08:00",
                })
              ) {
                setCreating(false);
                setTitle("");
                setStartsAt("");
              }
            }}
          >
            <Field
              label="獎池標題"
              placeholder="例如：金幣 100"
              value={title}
              maxLength={80}
              required
              onChange={(e) => setTitle(e.target.value)}
            />
            <Field
              label="開獎時間（台灣時間）"
              type="datetime-local"
              value={startsAt}
              required
              onChange={(e) => setStartsAt(e.target.value)}
            />
            <p className="hint">
              建立後房主自動加入；其他成員需由房主在開獎前確認參加資格。時間須在一分鐘後至七天內。
            </p>
            <Button primary disabled={busy}>
              建立獎池
            </Button>
          </form>
        </Modal>
      )}
      {selected && (
        <Modal
          title={room?.title || "獎池已清理"}
          onClose={() => setSelected(null)}
        >
          {!room ? (
            <p>此筆紀錄已到每日清理時間。</p>
          ) : (
            <div className="prize-room">
              <div>
                <Wheel
                  room={room}
                  clockOffset={offset}
                  onComplete={setCompletedDraw}
                />
                <p className="prize-result" role="status">
                  {room.status === "cancelled"
                    ? "沒有合格參加者，抽獎取消"
                    : drawing
                      ? now < (room.spin.startsAt ?? room.settledAt)
                        ? "準備開獎…"
                        : "開獎中…"
                      : room.winnerId
                        ? `得獎者：${room.eligible.find((e) => e.userId === room.winnerId)?.name}`
                        : now >= room.startsAt
                          ? "正在確認開獎結果…"
                          : `距離開獎 ${Math.ceil((room.startsAt - now) / 1000)} 秒`}
                </p>
                <p className="muted">
                  {time(room.startsAt)} · 房主 {room.ownerName}
                </p>
                {room.status === "open" && !ownEntry && (
                  <Button
                    primary
                    disabled={busy || now >= room.startsAt}
                    onClick={() => act("casino.join", { id: room.id })}
                  >
                    申請加入
                  </Button>
                )}
                {ownEntry && (
                  <p>
                    你的狀態：
                    {
                      {
                        pending: "等待房主審核",
                        approved: "已確認加入",
                        rejected: "未通過資格審核",
                      }[ownEntry.status]
                    }
                  </p>
                )}
              </div>
              <div className="prize-members">
                <h3>參加名單</h3>
                {!room.entries.length && <p className="muted">尚無參加者</p>}
                {room.entries.map((e, i) => (
                  <div className="prize-member" key={e.userId}>
                    <span>
                      {i + 1}. {e.name}
                      <small>
                        {
                          {
                            pending: "等待審核",
                            approved: "已確認",
                            rejected: "已拒絕",
                          }[e.status]
                        }
                      </small>
                    </span>
                    {room.ownerId === me.id &&
                      e.status === "pending" &&
                      room.status === "open" && (
                        <div>
                          <Button
                            disabled={busy || now >= room.startsAt}
                            onClick={() =>
                              act("casino.review", {
                                id: room.id,
                                userId: e.userId,
                                approved: true,
                              })
                            }
                          >
                            確認
                          </Button>
                          <Button
                            disabled={busy || now >= room.startsAt}
                            onClick={() =>
                              act("casino.review", {
                                id: room.id,
                                userId: e.userId,
                                approved: false,
                              })
                            }
                          >
                            拒絕
                          </Button>
                        </div>
                      )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Modal>
      )}
    </section>
  );
}
