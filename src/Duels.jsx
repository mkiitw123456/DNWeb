import { useEffect, useRef, useState } from "react";
import { Star, Moon } from "lucide-react";
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
  const offset = useRef(0),
    locked = useRef(false),
    seq = useRef(0),
    lastTick = useRef(0);
  const watching = useRef(null);
  watching.current = selected;
  const now = () => Date.now() + offset.current;
  function accept(data) {
    offset.current = data.serverNow - Date.now();
    setState(data);
    setError("");
  }
  useEffect(() => {
    let live = true,
      pending = false,
      lastPoll = 0;
    async function poll() {
      if (pending || locked.current || document.hidden) return;
      if (!watching.current && Date.now() - lastPoll < 10000) return;
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
  const remaining =
    room?.status === "pending"
      ? Math.max(0, Math.ceil((room.acceptBy - current) / 1000))
      : room?.startsAt
        ? Math.max(0, Math.ceil((room.startsAt - current) / 1000))
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
      <div className="duel-list">
        {state.rooms.map((r) => (
          <article key={r.id}>
            <div>
              <small>
                {labels[r.status]} · {r.ownerName}
              </small>
              <h3>{r.title}</h3>
              {r.winnerName && <p>獲勝者：{r.winnerName}</p>}
            </div>
            <Button onClick={() => setSelected(r.id)}>觀看</Button>
          </article>
        ))}
        {!state.rooms.length && <p>目前沒有房間，來建立第一場星月對決。</p>}
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
          className="duel-modal"
          onClose={() => setSelected(null)}
        >
          <Coin key={room.id} room={room} now={now} />
          <div className="duel-players">
            <div>
              {room.ownerName}
              <small>{room.side === "star" ? "★ 星星" : "☾ 月亮"} · 房主</small>
            </div>
            <span>VS</span>
            <div>
              {room.guestName || "等待加入"}
              <small>{room.side === "star" ? "☾ 月亮" : "★ 星星"}</small>
            </div>
          </div>
          <p className="duel-status" role="status">
            {room.status === "pending"
              ? `等待房主接受 · ${remaining} 秒`
              : room.status === "tossing"
                ? remaining > 0
                  ? `${remaining} 秒後拋出硬幣`
                  : "硬幣轉動中…"
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
