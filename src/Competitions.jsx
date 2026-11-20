import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, Clock, Coins, Moon, Users } from "lucide-react";
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
function Schedule({ room }) {
  const [now, setNow] = useState(Date.now);
  const running = room.total == null && room.scheduledAt > now;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  const seconds = Math.max(0, Math.ceil((room.scheduledAt - now) / 1000));
  const digits = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(v => String(v).padStart(2, "0")).join(":");
  return <div className="match-schedule"><span><Clock size={15}/> {time(room.scheduledAt)} 台灣時間</span>
    <strong>{room.total != null ? "已結算" : running ? "距開賽 " + digits : "已到開賽時間"}</strong></div>;
}
function Chart({ entries, motion }) {
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
    let begin;
    let frame;
    function paint(now) {
      begin ??= now;
      const t = motion ? Math.min(1, (now - begin) / 1350) : 1,
        ease = t * t * (3 - 2 * t);
      ctx.clearRect(0, 0, 480, 480);
      let angle = -Math.PI / 2;
      previous.current = end.map((v, i) => {
        const part = (start[i] || 0) + (v - (start[i] || 0)) * ease;
        if (part > 0) {
          ctx.beginPath();
          ctx.moveTo(240, 240);
          ctx.arc(240, 240, 239, angle, angle + Math.PI * 2 * part);
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
  }, [amounts, motion]);
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
      </div>
      <figcaption>
        <Moon size={16} /> 月亮幣合計 <strong key={total} className="competition-count">{fmt(total)}</strong>
      </figcaption>
    </figure>
  );
}
function Ranking({ room, onChoose, motion, arrival }) {
  const list = useRef(null),
    positions = useRef(new Map());
  const rows = room.entries
    .map((e, i) => ({ ...e, color: color(i) }))
    .sort((a, b) => b.coins - a.coins);
  const total = rows.reduce((s, e) => s + e.coins, 0);
  useLayoutEffect(() => {
    const next = new Map();
    for (const el of list.current.children) {
      const id = el.dataset.id,
        y = el.offsetTop,
        old = positions.current.get(id);
      next.set(id, { y, coins: el.dataset.coins });
      if (motion && old?.coins !== el.dataset.coins) el.querySelector("small").animate([{ color: "var(--team)", transform: "translateX(8px)" }, { transform: "translateX(0)" }], {duration: 900});
      if (motion && old?.y !== y)
        el.animate(
          old === undefined
            ? [
                { opacity: 0, transform: "translateX(85%)" },
                { opacity: 1, transform: "none" },
              ]
            : [
                { transform: `translateY(${old.y - y}px)` },
                { transform: "none" },
              ],
          { duration: old ? 850 : 1100, delay: old ? 0 : 100, fill: "backwards", easing: "cubic-bezier(.35,0,.18,1)" },
        );
    }
    positions.current = next;
  }, [room.version, motion]);
  return (
    <section>
      <h3>參賽排名</h3>
      <ol className="competition-ranks" ref={list}>
        {rows.map((e, i) => (
          <li key={e.id} data-id={e.id} data-coins={e.coins} style={{ "--team": e.color }}>
            <span>{i + 1}</span>
            <div>
              <strong>{e.name}</strong>
              {arrival?.id === e.id && <em className="competition-new" role="status">剛加入</em>}
              <small>
                {fmt(e.coins)} 月亮幣 ·{" "}
                {total ? ((100 * e.coins) / total).toFixed(1) : 0}%
                {room.total != null && ` · 分得 ${fmt(e.payout)}`}
              </small>
            </div>
            <i className="competition-share" aria-hidden="true" style={{ transform: `scaleX(${total ? e.coins / total : 0})` }} />
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
    [history, setHistory] = useState(false),
    [archivePages, setArchivePages] = useState(0),
    [older, setOlder] = useState([]),
    [nextPage, setNextPage] = useState(null),
    [paging, setPaging] = useState(false),
    [arrival, setArrival] = useState(null),
    [room, setRoom] = useState(null),
    [form, setForm] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [motion, setMotion] = useState(() => {
    const preference = localStorage.getItem("competitionMotion");
    return preference === null ? !matchMedia("(prefers-reduced-motion: reduce)").matches : preference === "on";
  });
  const selected = useRef(null),
    seq = useRef(0),
    lock = useRef(false),
    polling = useRef(false);
  const viewingHistory = useRef(false), seen = useRef(null);
  useEffect(() => {
    if (!room) { seen.current = null; setArrival(null); return; }
    const prior = seen.current;
    seen.current = { id: room.id, count: room.entries.length };
    if (prior?.id === room.id && prior.count < room.entries.length)
      setArrival(room.entries[room.entries.length - 1]);
  }, [room]);
  useEffect(() => {
    if (!arrival) return;
    const timer = setTimeout(() => setArrival(null), 2400);
    return () => clearTimeout(timer);
  }, [arrival]);
  async function loadOlder() {
    const page = nextPage ?? archivePages;
    if (!page || paging) return;
    setPaging(true);
    try {
      const result = await request("competition.history", {page});
      setOlder(items => [...items, ...result.rooms]);
      setNextPage(page - 1);
    } catch (e) { notify(e.message, "error"); }
    finally { setPaging(false); }
  }
  async function load(id = selected.current) {
    const stamp = ++seq.current;
    try {
      const view = await request("competition.state", { id });
      if (seq.current !== stamp) return;
      setRooms(view.rooms);
      setArchivePages(view.archivePages || 0);
      if (view.room?.total != null && !viewingHistory.current) {
        close();
        notify("比賽已結算，可至歷史紀錄查看");
      } else setRoom(view.room);
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
      setArchivePages(view.archivePages || 0);
      if (type === "settle") close();
      else {
        if (type === "create") { setHistory(false); viewingHistory.current = false; }
        setRoom(view.room);
        selected.current = view.room.id;
      }
      setForm(null);
      setError("");
      notify(
        {
          create: "比賽已建立",
          join: "已加入比賽",
          score: "月亮幣已更新",
          settle: "比賽已結算，已移至歷史紀錄",
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
  const shown = rooms?.filter(r => history === (r.total != null)) || [];
  if (history) {
    const ids = new Set(shown.map(r => r.id));
    shown.push(...older.filter(r => !ids.has(r.id)));
  }
  return (
    <section>
      {error && (
        <p role="alert">
          {error} <Button onClick={() => load()}>重試</Button>
        </p>
      )}
      {!room && <>
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
      <nav className="competition-switch" aria-label="比賽清單">
        {[[false, "進行中"], [true, "歷史紀錄"]].map(([value, label]) =>
          <Button key={label} aria-pressed={history === value} onClick={() => {
            viewingHistory.current = value; setHistory(value);
            if (value) { setOlder([]); setNextPage(null); }
          }}>{label}</Button>
        )}
      </nav>
      {!rooms && !error && <p>正在讀取比賽…</p>}
      {rooms && shown.length === 0 && (
        <p className="muted">{history ? "還沒有已結算的比賽。" : "目前沒有進行中的比賽。"}</p>
      )}
      <div className="competition-list">
        {shown.map((r) => (
          <article key={r.id}>
            <h3>{r.title}</h3>
            <div>
              <span>
                <Clock size={15} />
                {time(r.scheduledAt)}
              </span>
              <span>
                <Users size={15} key={r.count} className="competition-count" />
                {r.count} 人參與
              </span>
            </div>
            <Button onClick={() => watch(r.id)}>觀看</Button>
          </article>
        ))}
      </div>
      {history && (nextPage ?? archivePages) > 0 && <Button disabled={paging} onClick={loadOlder}>{paging ? "讀取中…" : "載入更早紀錄"}</Button>}
      </>}
      {room && <article className="match-page">
        <Button className="match-back" disabled={busy} onClick={close}><ArrowLeft size={16}/> 返回比賽清單</Button>
        <header className="match-title"><h1>{room.title}</h1><Schedule key={room.id} room={room}/></header>
        <div className="match-layout">
          <aside className="match-box match-rules"><h2>比賽規則</h2><p className="competition-body">{room.description}</p><small>房主 · {room.ownerName}</small></aside>
          <section className="match-feature">
            <img className="match-poster" src="/guild-challenge.webp" alt="群山競技場中的挑戰賽獎盃"/>
            <div className="match-pool"><span className="match-coin"><Coins size={32}/></span><div><h2>獎池總額</h2><strong>{room.total == null ? "待房主結算" : fmt(room.total)}</strong></div></div>
          </section>
          <aside className="match-box match-log"><h2>比賽日誌</h2><p><Users size={16}/> {room.entries.length} 人參與</p>
            {room.events?.length ? <ol>{room.events.slice().reverse().map((event,i) => <li key={room.events.length-i}><time>{time(event.at)}</time>{event.message}</li>)}</ol> : <small>這場比賽尚無日誌紀錄。</small>}
          </aside>
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
          <label className="competition-motion"><input type="checkbox" checked={motion} onChange={e => {
            setMotion(e.target.checked);
            localStorage.setItem("competitionMotion", e.target.checked ? "on" : "off");
          }} />播放比賽動畫</label>
          <div className="competition-grid" data-motion={motion}>
            <Chart entries={room.entries} motion={motion} />
            <Ranking
              motion={motion}
              arrival={arrival}
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
        </article>}
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
