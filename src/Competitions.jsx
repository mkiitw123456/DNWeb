import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Clock, Moon, Users } from "lucide-react";
import { Button, Heading, Field, Modal } from "./ui.jsx";
import { notify } from "./FeedbackHost.jsx";
import "./competitions.css";

const time = (n) =>
  new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(n);
const color = (i) => `hsl(${(206 + i * 137.508) % 360} 65% 60%)`;
const fmt = (n) => n.toLocaleString("zh-TW");
function Chart({ entries }) {
  const canvas = useRef(null),
    previous = useRef([]);
  const amounts = entries.map((e) => e.coins).join(",");
  useEffect(() => {
    const node = canvas.current,
      ctx = node.getContext("2d");
    if (!ctx) return;
    const values = amounts ? amounts.split(",").map(Number) : [];
    const total = values.reduce((a, b) => a + b, 0);
    const start = previous.current.slice(),
      end = values.map((n) => (total ? n / total : 0));
    const begin = performance.now(),
      reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame;
    function paint(now) {
      const t = reduced ? 1 : Math.min(1, (now - begin) / 550),
        ease = 1 - (1 - t) ** 3;
      ctx.clearRect(0, 0, 480, 480);
      let angle = -Math.PI / 2;
      previous.current = end.map((v, i) => {
        const part = (start[i] || 0) + (v - (start[i] || 0)) * ease;
        if (part > 0) {
          ctx.beginPath();
          ctx.moveTo(240, 240);
          ctx.arc(240, 240, 228, angle, angle + Math.PI * 2 * part);
          ctx.closePath();
          ctx.fillStyle = color(i);
          ctx.fill();
          angle += Math.PI * 2 * part;
        }
        return part;
      });
      if (t < 1) frame = requestAnimationFrame(paint);
    }
    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, [amounts]);
  const total = entries.reduce((n, e) => n + e.coins, 0);
  return (
    <figure className="competition-chart">
      <div className="competition-disc">
        <canvas
          width="480"
          height="480"
          ref={canvas}
          aria-label="參賽者月亮幣占比，詳細數字見排名"
          role="img"
        />
        {!total && <span>等待發放月亮幣</span>}
        {entries.length > 0 && <i key={entries.length} aria-hidden="true" />}
      </div>
      <figcaption>
        <Moon size={16} /> 月亮幣合計 <strong>{fmt(total)}</strong>
      </figcaption>
    </figure>
  );
}
function Ranking({ room, onChoose }) {
  const list = useRef(null),
    positions = useRef(new Map());
  const rows = room.entries
    .map((e, i) => ({ ...e, color: color(i) }))
    .sort((a, b) => b.coins - a.coins);
  const total = rows.reduce((s, e) => s + e.coins, 0);
  useLayoutEffect(() => {
    const next = new Map(),
      reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const el of list.current.children) {
      const id = el.dataset.id,
        y = el.offsetTop,
        old = positions.current.get(id);
      next.set(id, y);
      if (!reduce && old !== y)
        el.animate(
          old === undefined
            ? [
                { opacity: 0, transform: "translateX(18px)" },
                { opacity: 1, transform: "none" },
              ]
            : [
                { transform: `translateY(${old - y}px)` },
                { transform: "none" },
              ],
          { duration: 340, easing: "ease-out" },
        );
    }
    positions.current = next;
  }, [room.version]);
  return (
    <section>
      <h3>參賽排名</h3>
      <ol className="competition-ranks" ref={list}>
        {rows.map((e, i) => (
          <li key={e.id} data-id={e.id} style={{ "--team": e.color }}>
            <span>{i + 1}</span>
            <div>
              <strong>{e.name}</strong>
              <small>
                {fmt(e.coins)} 月亮幣 ·{" "}
                {total ? ((100 * e.coins) / total).toFixed(1) : 0}%
                {room.total != null && ` · 分得 ${fmt(e.payout)}`}
              </small>
            </div>
            {onChoose && (
              <Button
                onClick={() => onChoose(e)}
                aria-label={`調整 ${e.name} 的月亮幣`}
              >
                調整
              </Button>
            )}
          </li>
        ))}
      </ol>
      {!rows.length && <p>尚無參賽者</p>}
    </section>
  );
}

export default function Competitions({ me, request, onUnauthorized }) {
  const [rooms, setRooms] = useState(null),
    [room, setRoom] = useState(null),
    [form, setForm] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const selected = useRef(null),
    seq = useRef(0),
    lock = useRef(false),
    polling = useRef(false);
  async function load(id = selected.current) {
    const stamp = ++seq.current;
    try {
      const view = await request("competition.state", { id });
      if (seq.current !== stamp) return;
      setRooms(view.rooms);
      setRoom(view.room);
      setError("");
      if (id && !view.room) {
        selected.current = null;
        setForm(null);
        notify("此比賽已移出清單", "error");
      }
    } catch (e) {
      if (seq.current === stamp) {
        setError(e.message);
        if (e.status === 401) onUnauthorized();
      }
    }
  }
  useEffect(() => {
    load();
    let last = Date.now();
    const timer = setInterval(async () => {
      if (
        document.hidden ||
        lock.current ||
        polling.current ||
        Date.now() - last < (selected.current ? 4500 : 20000)
      )
        return;
      polling.current = true;
      last = Date.now();
      try {
        await load();
      } finally {
        polling.current = false;
      }
    }, 1000);
    return () => {
      clearInterval(timer);
      seq.current++;
    };
  }, [request, onUnauthorized]);
  function watch(id) {
    selected.current = id;
    setRoom(null);
    setForm(null);
    load(id);
  }
  function close() {
    selected.current = null;
    seq.current++;
    setRoom(null);
    setForm(null);
  }
  async function act(type, payload) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    const stamp = ++seq.current;
    try {
      const view = await request("competition." + type, payload);
      if (seq.current !== stamp) return;
      setRooms(view.rooms);
      setRoom(view.room);
      selected.current = view.room.id;
      setForm(null);
      setError("");
      notify(
        {
          create: "比賽已建立",
          join: "已加入比賽",
          score: "月亮幣已更新",
          settle: "比賽已結算",
        }[type],
      );
    } catch (e) {
      if (seq.current === stamp) {
        notify(e.message, "error");
        if (e.status === 401) onUnauthorized();
        if (e.status === 409) {
          setForm(null);
          await load();
        }
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const patch = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const host = room?.ownerId === me.id,
    open = room?.total == null;
  return (
    <section>
      <Heading
        title="比賽"
        onAdd={() =>
          setForm({
            kind: "create",
            title: "",
            description: "",
            scheduledAt: "",
            submissionId: crypto.randomUUID(),
          })
        }
        addLabel="建立比賽"
      />
      {error && (
        <p role="alert">
          {error} <Button onClick={() => load()}>重試</Button>
        </p>
      )}
      {!rooms && !error && <p>正在讀取比賽…</p>}
      {rooms?.length === 0 && (
        <p className="muted">還沒有比賽，來建立第一場吧。</p>
      )}
      <div className="competition-list">
        {rooms?.map((r) => (
          <article key={r.id}>
            <h3>{r.title}</h3>
            <div>
              <span>
                <Clock size={15} />
                {time(r.scheduledAt)}
              </span>
              <span>
                <Users size={15} />
                {r.count} 人參與
              </span>
            </div>
            <Button onClick={() => watch(r.id)}>觀看</Button>
          </article>
        ))}
      </div>
      {room && (
        <Modal
          title={room.title}
          className="competition-modal"
          onClose={() => {
            if (!busy) close();
          }}
        >
          <p className="muted">
            {time(room.scheduledAt)}（台灣時間） · 房主 {room.ownerName}
          </p>
          <p className="competition-body">{room.description}</p>
          <div className="competition-grid">
            <Chart entries={room.entries} />
            <Ranking
              room={room}
              onChoose={
                host && open
                  ? (e) =>
                      setForm({
                        kind: "score",
                        memberId: e.id,
                        name: e.name,
                        previous: e.coins,
                        coins: String(e.coins),
                      })
                  : null
              }
            />
          </div>
          <div className="competition-actions">
            {open && !room.entries.some((e) => e.id === me.id) && (
              <Button
                primary
                disabled={busy}
                onClick={() => act("join", { id: room.id })}
              >
                加入比賽
              </Button>
            )}
            {open && room.entries.some((e) => e.id === me.id) && (
              <small>已加入比賽</small>
            )}
            {host && open && (
              <Button
                className="competition-settle"
                disabled={busy || !room.entries.some((e) => e.coins > 0)}
                onClick={() =>
                  setForm({ kind: "settle", version: room.version, total: "" })
                }
              >
                結算
              </Button>
            )}
            {!open && <strong>已結算 · 總額 {fmt(room.total)}</strong>}
          </div>
        </Modal>
      )}
      {form && (
        <Modal
          title={
            { create: "建立比賽", score: "調整月亮幣", settle: "結算比賽" }[
              form.kind
            ]
          }
          onClose={() => {
            if (!busy) setForm(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (form.kind === "create")
                act("create", {
                  title: form.title,
                  description: form.description,
                  scheduledAt: form.scheduledAt,
                  submissionId: form.submissionId,
                });
              else if (form.kind === "score")
                act("score", {
                  id: room.id,
                  memberId: form.memberId,
                  previous: form.previous,
                  coins: Number(form.coins),
                });
              else
                act("settle", {
                  id: room.id,
                  total: Number(form.total),
                  version: form.version,
                });
            }}
          >
            {form.kind === "create" ? (
              <>
                <Field
                  label="比賽標題"
                  required
                  maxLength={80}
                  value={form.title}
                  onChange={(e) => patch("title", e.target.value)}
                />
                <Field label="比賽內文">
                  <textarea
                    required
                    rows={4}
                    maxLength={1500}
                    value={form.description}
                    onChange={(e) => patch("description", e.target.value)}
                  />
                </Field>
                <Field
                  label="預計時間（台灣時間）"
                  type="datetime-local"
                  required
                  value={form.scheduledAt}
                  onChange={(e) => patch("scheduledAt", e.target.value)}
                />
              </>
            ) : form.kind === "score" ? (
              <Field
                label={form.name + " 的月亮幣總數"}
                type="number"
                min="0"
                max="1000000000"
                required
                value={form.coins}
                onChange={(e) => patch("coins", e.target.value)}
              />
            ) : (
              <>
                <Field
                  label="分配總額"
                  type="number"
                  min="1"
                  max="1000000000"
                  required
                  value={form.total}
                  onChange={(e) => patch("total", e.target.value)}
                />
                <p className="hint">
                  依月亮幣占比分配整數，餘額優先分給小數餘數較大者。結算後鎖定成績並通知
                  Discord。
                </p>
              </>
            )}
            <div className="form-actions">
              <Button
                type="button"
                disabled={busy}
                onClick={() => setForm(null)}
              >
                取消
              </Button>
              <Button primary disabled={busy}>
                {busy
                  ? "儲存中…"
                  : { create: "建立比賽", score: "儲存", settle: "確認結算" }[
                      form.kind
                    ]}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
