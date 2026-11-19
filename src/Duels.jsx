import { useEffect, useRef, useState } from "react";
import { Star, Moon, Trophy, Clock3, Users } from "lucide-react";
import { Button, Field, Modal } from "./ui.jsx";
import { notify } from "./FeedbackHost.jsx";
import { playSound } from "./sounds.js";
import "./duels.css";
const labels = {
  open: "等待加入",
  pending: "等待房主確認",
  tossing: "準備開獎",
  completed: "已完成",
  cancelled: "已取消",
};
function CountdownRing({ remaining, total, label }) {
  const progress = Math.max(0, Math.min(1, remaining / total));
  return (
    <div
      className={`duel-countdown ${remaining <= 5 ? "countdown-final" : ""}`}
      role="timer"
      aria-label={`${label}，剩餘 ${Math.ceil(remaining)} 秒`}
    >
      <svg viewBox="0 0 240 240" aria-hidden="true">
        <circle className="countdown-track" cx="120" cy="120" r="108" />
        <circle
          className="countdown-progress"
          cx="120"
          cy="120"
          r="108"
          pathLength="1"
          strokeDasharray="1"
          strokeDashoffset={1 - progress}
        />
      </svg>
      <div>
        <small>{label}</small>
        <strong>{Math.ceil(remaining).toString().padStart(2, "0")}</strong>
        <span>秒</span>
      </div>
    </div>
  );
}
function Coin({ room, now, side = "star" }) {
  const spin = useRef(),
    lift = useRef(),
    sounded = useRef(false);
  const start = room?.startsAt,
    outcome = room?.outcome,
    turns = room?.turns;
  useEffect(() => {
    if (!outcome || !start) return;
    const elapsed = Math.max(0, now() - start),
      duration = 5200;
    const angle = turns * 360 + (outcome === "moon" ? 180 : 0);
    const options = {
      duration,
      fill: "forwards",
      easing: "cubic-bezier(.16,.05,.18,1)",
    };
    const rotation = spin.current.animate(
      [{ transform: "rotateY(0deg)" }, { transform: `rotateY(${angle}deg)` }],
      options,
    );
    const flight = lift.current.animate(
      [
        { transform: "translateY(0) scale(1)" },
        { transform: "translateY(-55px) scale(1.35)", offset: 0.35 },
        { transform: "translateY(0) scale(1)" },
      ],
      { ...options, easing: "ease-in-out" },
    );
    rotation.currentTime = Math.min(elapsed, duration);
    flight.currentTime = Math.min(elapsed, duration);
    const timer =
      elapsed < duration
        ? setTimeout(() => {
            if (!sounded.current) {
              playSound("coin");
              sounded.current = true;
            }
          }, duration - elapsed)
        : null;
    return () => {
      rotation.cancel();
      flight.cancel();
      clearTimeout(timer);
    };
  }, [start, outcome, turns]);
  return (
    <div
      className="duel-stage"
      aria-label={
        outcome ? `硬幣：${outcome === "star" ? "星星" : "月亮"}` : "星月硬幣"
      }
    >
      <div ref={lift}>
        <div
          className="duel-coin"
          ref={spin}
          style={
            !room?.outcome
              ? { transform: `rotateY(${side === "moon" ? 180 : 0}deg)` }
              : undefined
          }
        >
          <div className="coin-face">
            <Star size={74} fill="currentColor" />
          </div>
          <div className="coin-face coin-back">
            <Moon size={74} fill="currentColor" />
          </div>
        </div>
      </div>
    </div>
  );
}
export default function Duels({ me, request, onUnauthorized }) {
  const [state, setState] = useState({ rooms: [] }),
    [selected, setSelected] = useState(null),
    [creating, setCreating] = useState(false),
    [busy, setBusy] = useState(false),
    [title, setTitle] = useState(""),
    [side, setSide] = useState("star"),
    [clock, setClock] = useState(Date.now()),
    [error, setError] = useState("");
  const [filter, setFilter] = useState("active");
  const offset = useRef(0),
    locked = useRef(false),
    seq = useRef(0),
    lastTick = useRef(0);
  const watching = useRef(null);
  watching.current = selected;
  const latest = useRef(state);
  latest.current = state;
  const now = () => Date.now() + offset.current;
  function accept(data) {
    const receivedAt = Date.now();
    offset.current = data.serverNow - receivedAt;
    setClock(receivedAt);
    setState(data);
    setError("");
  }
  useEffect(() => {
    let live = true,
      pending = false,
      lastPoll = 0;
    async function poll() {
      if (pending || locked.current || document.hidden) return;
      const watched = latest.current.rooms.find(
        (r) => r.id === watching.current,
      );
      const current = Date.now() + offset.current;
      const playing = watched?.status === "tossing";
      // The entire animation runs locally once its immutable outcome arrives.
      if (playing && watched.outcome && current < watched.endsAt) return;
      const boundary =
        playing &&
        ((!watched.outcome && current >= watched.startsAt) ||
          current >= watched.endsAt);
      const interval =
        !watched || ["completed", "cancelled"].includes(watched.status)
          ? 20000
          : 3000;
      if (!boundary && Date.now() - lastPoll < interval) return;
      lastPoll = Date.now();
      pending = true;
      const id = ++seq.current;
      try {
        const data = await request("duel.state");
        if (live && id === seq.current) accept(data);
      } catch (e) {
        if (live) {
          setError(e.message);
          if (e.status === 401) onUnauthorized();
        }
      } finally {
        pending = false;
      }
    }
    poll();
    const timer = setInterval(poll, 1000),
      tick = setInterval(() => setClock(Date.now()), 200);
    return () => {
      live = false;
      clearInterval(timer);
      clearInterval(tick);
    };
  }, [request, onUnauthorized]);
  async function act(type, payload) {
    if (locked.current) return false;
    locked.current = true;
    ++seq.current;
    setBusy(true);
    try {
      accept(await request(type, payload));
      notify("操作成功");
      return true;
    } catch (e) {
      notify(e.message, "error");
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  const room = state.rooms.find((r) => r.id === selected),
    current = clock + offset.current;
  const countdown =
    room?.status === "pending" ||
    (room?.status === "tossing" && current < room.startsAt);
  const countdownTotal = room?.status === "pending" ? 100 : 10;
  const countdownLeft = Math.min(
    countdownTotal,
    Math.max(
      0,
      ((room?.status === "pending" ? room.acceptBy : room?.startsAt) -
        current) /
        1000,
    ),
  );
  const remaining =
    room?.status === "pending"
      ? Math.min(100, Math.max(0, Math.ceil((room.acceptBy - current) / 1000)))
      : room?.startsAt
        ? Math.min(10, Math.max(0, Math.ceil((room.startsAt - current) / 1000)))
        : 0;
  useEffect(() => {
    if (
      room?.status === "tossing" &&
      remaining > 0 &&
      remaining <= 10 &&
      remaining !== lastTick.current
    )
      playSound("tick");
    lastTick.current = remaining;
  }, [room?.id, room?.status, remaining]);
  return (
    <section className="duels">
      <div className="section-title">
        <h2>星月對決</h2>
        <Button primary onClick={() => setCreating(true)}>
          建立房間
        </Button>
      </div>
      <p className="muted">
        選擇星星或月亮，等待另一位冒險者加入。房主確認後開始拋幣。
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="duel-list-toolbar">
        <div className="duel-filters">
          {[
            ["active", "進行中的房間"],
            ["history", "已完成／取消"],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}
              <span>
                {
                  state.rooms.filter(
                    (r) =>
                      ["completed", "cancelled"].includes(r.status) ===
                      (id === "history"),
                  ).length
                }
              </span>
            </button>
          ))}
        </div>
        <small>
          <Users size={14} />
          雙人對決 · 星月各 50%
        </small>
      </div>
      <div className="duel-list">
        {state.rooms
          .filter(
            (r) =>
              ["completed", "cancelled"].includes(r.status) ===
              (filter === "history"),
          )
          .map((r) => (
            <article key={r.id}>
              <span className="duel-room-emblem">
                {r.side === "star" ? <Star /> : <Moon />}
              </span>
              <div>
                <small className={`duel-badge badge-${r.status}`}>
                  {labels[r.status]} · {r.ownerName}
                </small>
                <h3>{r.title}</h3>
                {r.winnerName && <p>獲勝者：{r.winnerName}</p>}
              </div>
              <Button onClick={() => setSelected(r.id)}>觀看</Button>
            </article>
          ))}
        {!state.rooms.some(
          (r) =>
            ["completed", "cancelled"].includes(r.status) ===
            (filter === "history"),
        ) && (
          <p className="duel-empty">
            {filter === "active"
              ? "目前沒有進行中的房間，來建立下一場星月對決。"
              : "還沒有完成的對決紀錄。"}
          </p>
        )}
      </div>
      {creating && (
        <Modal title="建立星月對決" onClose={() => !busy && setCreating(false)}>
          <Coin now={now} side={side} />
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await act("duel.create", { title, side })) {
                setCreating(false);
                setTitle("");
              }
            }}
          >
            <div className="coin-choices">
              {["star", "moon"].map((s) => (
                <Button
                  type="button"
                  key={s}
                  aria-pressed={side === s}
                  onClick={() => setSide(s)}
                >
                  {s === "star" ? "★ 星星" : "☾ 月亮"}
                </Button>
              ))}
            </div>
            <Field
              label="房間標題"
              required
              maxLength={80}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：淨水 5 個"
            />
            <div className="form-actions">
              <Button primary disabled={busy}>
                建立房間
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {room && (
        <Modal
          title={room.title}
          className={`duel-modal duel-phase-${room.status}`}
          onClose={() => setSelected(null)}
        >
          <div className="duel-round-meta">
            <span>
              <Clock3 size={14} />
              {labels[room.status]}
            </span>
            <span>星星 50% · 月亮 50%</span>
          </div>
          <div className={`duel-arena ${countdown ? "has-countdown" : ""}`}>
            <div className="duel-orbit" aria-hidden="true" />
            <Coin key={room.id} room={room} now={now} side={room.side} />
            {countdown && (
              <CountdownRing
                remaining={countdownLeft}
                total={countdownTotal}
                label={
                  room.status === "pending" ? "等待房主確認" : "即將拋出硬幣"
                }
              />
            )}
            {room.status === "completed" && (
              <div className="duel-winner-seal">
                <Trophy size={16} />
                本局勝方
              </div>
            )}
          </div>
          <div className="duel-players">
            <div
              className={room.winnerId === room.ownerId ? "player-winner" : ""}
            >
              <span className="duel-player-mark">
                {room.side === "star" ? <Star /> : <Moon />}
              </span>
              <strong>{room.ownerName}</strong>
              <small>{room.side === "star" ? "★ 星星" : "☾ 月亮"} · 房主</small>
            </div>
            <span>VS</span>
            <div
              className={
                room.winnerId === room.guestId && room.guestId
                  ? "player-winner"
                  : ""
              }
            >
              <span className="duel-player-mark">
                {room.side === "star" ? <Moon /> : <Star />}
              </span>
              <strong>{room.guestName || "等待挑戰者"}</strong>
              <small>{room.side === "star" ? "☾ 月亮" : "★ 星星"}</small>
            </div>
          </div>
          <p className="duel-status" role="status">
            {room.status === "pending"
              ? `等待房主接受 · ${remaining} 秒`
              : room.status === "tossing"
                ? remaining > 0
                  ? `${remaining} 秒後拋出硬幣`
                  : room.outcome
                    ? "硬幣轉動中…"
                    : "正在同步開獎…"
                : room.status === "completed"
                  ? `${room.outcome === "star" ? "★ 星星" : "☾ 月亮"} · ${room.winnerName} 獲勝`
                  : labels[room.status]}
          </p>
          <div className="form-actions">
            {room.status === "open" &&
              (room.ownerId === me.id ? (
                <Button
                  disabled={busy}
                  onClick={() => act("duel.cancel", { id: room.id })}
                >
                  取消房間
                </Button>
              ) : (
                <Button
                  primary
                  disabled={busy}
                  onClick={() => act("duel.join", { id: room.id })}
                >
                  加入對決
                </Button>
              ))}
            {room.status === "pending" && room.ownerId === me.id && (
              <>
                <Button
                  disabled={busy}
                  onClick={() => act("duel.reject", { id: room.id })}
                >
                  拒絕
                </Button>
                <Button
                  primary
                  disabled={busy || !remaining}
                  onClick={() => act("duel.accept", { id: room.id })}
                >
                  確認並接受
                </Button>
              </>
            )}
            {room.status === "pending" && room.guestId === me.id && (
              <Button
                disabled={busy}
                onClick={() => act("duel.leave", { id: room.id })}
              >
                取消加入
              </Button>
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}
