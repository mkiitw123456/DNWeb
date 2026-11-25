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
function MatchRules({ description, ownerName }) {
  const preview = useRef(null);
  const [truncated, setTruncated] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    const node = preview.current;
    const measure = () => setTruncated(node.scrollHeight > node.clientHeight + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    observer.observe(node.firstElementChild);
    measure();
    return () => observer.disconnect();
  }, [description]);

  return (
    <aside className="match-box match-rules">
      <h2>比賽規則</h2>
      <div className="match-rules-space">
        <div className="match-rules-preview" ref={preview}>
          <p className="competition-body">{description}</p>
        </div>
      </div>
      {truncated && <Button className="match-read-more" aria-haspopup="dialog" onClick={() => setExpanded(true)}>閱讀全文</Button>}
      <small>房主 · {ownerName}</small>
      {expanded && <Modal title="完整比賽規則" className="match-rules-dialog" onClose={() => setExpanded(false)}>
        <p className="competition-body" tabIndex={0}>{description}</p>
      </Modal>}
    </aside>
  );
}

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
      <h3>{room.pool ? "獎池月亮幣排名" : "參賽排名"}</h3>
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
  const [motion, setMotion] = useState(() => !matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setMotion(!media.matches);
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  const revision = useRef(null),
    selected = useRef(null),
    seq = useRef(0),
    lock = useRef(false),
    polling = useRef(false);
  const viewingHistory = useRef(false), seen = useRef(null);
  useEffect(() => {
    if (!room) { seen.current = null; setArrival(null); return; }
    const prior = seen.current;
    const members = room.pool?.bets ?? room.entries;
    seen.current = { id: room.id, count: members.length };
    if (prior?.id === room.id && prior.count < members.length)
      setArrival(members[members.length - 1]);
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
      const view = id
        ? await request("competition.room", { id, revision: revision.current })
        : await request("competition.state", {});
      if (seq.current !== stamp) return;
      setError("");
      if (!id) {
        setRooms(view.rooms);
        setArchivePages(view.archivePages || 0);
        return;
      }
      if (view.unchanged) return;
      if (!view.room || (view.room.total != null && !viewingHistory.current)) {
        setRooms(list => list?.filter(r => r.id !== id) ?? null);
        close();
        notify(view.room ? "比賽已結算，可至歷史紀錄查看" : "此比賽已移出清單", view.room ? "success" : "error");
        await load(null);
        return;
      }
      revision.current = view.revision;
      setRoom(view.room);
      return view.room;
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
        (selected.current && viewingHistory.current) ||
        lock.current ||
        polling.current ||
        Date.now() - last < (selected.current ? 8000 : 60000)
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
    revision.current = null;
    selected.current = id;
    setRoom(null);
    setForm(null);
    load(id);
  }
  function close() {
    revision.current = null;
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
    const before = room;
    const previewEdits = ["score", "join", "bet"].includes(type);
    const submittedForm = form;
    if (type === "create") setForm(null);
    if (previewEdits && room) {
      const entries = room.pool?.bets ?? room.entries;
      const next = type === "score"
        ? entries.map(e => e.id === payload.memberId ? { ...e, coins: payload.coins } : e)
        : [...entries, { id: me.id, name: me.nickname || me.username, coins: 0 }];
      setRoom(room.pool ? { ...room, pool: { ...room.pool, bets: next } } : { ...room, entries: next });
      setForm(null);
    }
    try {
      const view = await request("competition." + type, payload);
      if (seq.current !== stamp) return;
      setRooms(view.rooms);
      setArchivePages(view.archivePages || 0);
      revision.current = null;
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
          join: "選手報名成功",
          openPool: "獎池已開放",
          lockPool: "投注已截止",
          bet: "已加入獎池",
          enroll: "已納入獎池",
          removePlayer: "已移除選手",
          score: "月亮幣已更新",
          settle: "比賽已結算，已移至歷史紀錄",
        }[type],
      );
    } catch (e) {
      if (seq.current === stamp) {
        if (type === "create") setForm(submittedForm);
        if (previewEdits) {
          setRoom(before);
          setArrival(null);
          setForm(submittedForm);
        }
        notify(e.message, "error");
        if (e.status === 401) onUnauthorized();
        if (e.status === 409) {
          setForm(null);
          const fresh = await load();
          if (type === "score" && fresh?.id === payload.id && fresh.total == null) {
            const member = (fresh.pool?.bets ?? fresh.entries).find(e => e.id === payload.memberId);
            if (member) setForm({ ...submittedForm, previous: member.coins });
          } else if (type === "create") setForm(submittedForm);
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
        onAdd={busy ? undefined : () =>
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
        <div className="match-toolbar"><Button className="match-back" onClick={() => { close(); load(null); }}><ArrowLeft size={16}/> 返回比賽清單</Button>
            {open && !room.pool && !room.entries.some((e) => e.id === me.id) && (
              <Button
                className="match-register primary"
                disabled={busy}
                onClick={() => act("join", { id: room.id })}
              >
                參與比賽
              </Button>
            )}
            {open && !room.pool && room.entries.some((e) => e.id === me.id) && (
              <small>已報名為選手</small>
            )}
        </div>
        <header className="match-title"><h1>{room.title}</h1><Schedule key={room.id} room={room}/><p className="muted">比賽由主持人在 Discord 頻道進行。</p></header>
        <div className="match-layout">
          <MatchRules key={room.id} description={room.description} ownerName={room.ownerName} />
          <section className="match-feature">
            {/鐵匠|強化/.test(room.title) ? <img className="match-poster" src="/forge-challenge.webp" alt="鐵匠為戰士、弓箭手、魔法師、祭司與機甲蘿莉強化裝備"/> : <img className="match-poster" src="/guild-challenge.webp" alt="群山競技場中的挑戰賽獎盃"/>}
            <div className="match-pool"><span className="match-coin"><Coins size={32}/></span><div><h2>獎池總額</h2><strong>{room.total != null ? fmt(room.total) : room.pool ? "由房主於結算時填寫" : "尚未開放投注"}</strong></div></div>
          </section>
          <aside className="match-box match-log"><h2>比賽日誌</h2><p><Users size={16}/> {room.entries.length} 位選手報名</p>
            {room.events?.length ? <ol>{room.events.slice().reverse().map((event,i) => <li key={room.events.length-i}><time>{time(event.at)}</time>{event.message}</li>)}</ol> : <small>這場比賽尚無日誌紀錄。</small>}
          </aside>
        </div>
          <div className="competition-actions">
            {open && (host || me.admin) && !room.pool && !room.entries.some(e=>e.coins > 0) &&
              <Button disabled={busy || !room.entries.length} onClick={() => setForm({kind:"openPool"})}>開啟獎池投注</Button>}
            {open && room.pool && !room.pool.locked && !room.pool.bets.some(b=>b.id === me.id) &&
              <Button primary disabled={busy} onClick={() => act("bet",{id:room.id})}>加入獎池投注</Button>}
            {open && room.pool && !room.pool.locked && host && <Button disabled={busy} onClick={()=>setForm({kind:"enroll",username:""})}>納入投注成員</Button>}
            {open && room.pool && !room.pool.locked && (host || me.admin) &&
              <Button disabled={busy} onClick={() => act("lockPool", {id:room.id})}>截止投注</Button>}
            {open && room.pool?.bets.some(b=>b.id === me.id) && <small>你已加入獎池</small>}
            {host && open && (room.pool?.bets ?? room.entries).some(e => e.coins > 0) && (
              <Button
                className="competition-settle"
                disabled={busy}
                onClick={() =>
                  setForm({ kind: "settle", version: room.version, total: "" })
                }
              >
                結算
              </Button>
            )}
            {!open && <strong>已結算 · 總額 {fmt(room.total)}</strong>}
          </div>
          <section className="match-roster"><h2>參賽選手</h2>{room.entries.length ? <ul className="match-players">{room.entries.map(e =>
            <li key={e.id}><span>{e.name}</span>{open && (host || me.admin) &&
              <Button disabled={busy} aria-label={"移除選手 " + e.name} onClick={() => setForm({kind:"removePlayer",memberId:e.id,name:e.name,version:room.version,coins:e.coins})}>移除</Button>}</li>
          )}</ul> : <p>等待第一位選手報名</p>}</section>
          {room.pool && <section className="match-roster"><h2>獎池投注</h2><p>{room.pool.locked ? "已截止加入" : "接受加入"} · {room.pool.bets.length} 人投注。月亮幣由房主登記。</p></section>}
          {(room.pool || room.total != null || room.entries.some(e => e.coins > 0)) && <>
          <div className="competition-grid" data-motion={motion}>
            <Chart entries={room.pool?.bets ?? room.entries} motion={motion} />
            <Ranking
              motion={motion}
              arrival={arrival}
              room={room.pool ? {...room,entries:room.pool.bets} : room}
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
          </>}
        </article>}
      {form && (
        <Modal
          title={
            { create: "建立比賽", removePlayer:"移除選手", enroll:"納入投注成員", openPool:"開啟獎池投注", score: "調整月亮幣", settle: "結算比賽" }[
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
              else if (form.kind === "removePlayer") act("removePlayer",{id:room.id,memberId:form.memberId,version:form.version});
              else if (form.kind === "enroll") act("enroll",{id:room.id,username:form.username});
              else if (form.kind === "openPool") act("openPool",{id:room.id});
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
            ) : form.kind === "removePlayer" ? <p>確定從本場選手名單移除「{form.name}」？{room.pool ? "獎池投注資格與月亮幣會保留。" : form.coins > 0 ? "這筆參賽紀錄的 " + fmt(form.coins) + " 月亮幣也會移除。" : "報名開放期間，成員可以重新報名。"}</p>
            : form.kind === "enroll" ? <Field label="成員帳號" required value={form.username} onChange={e=>patch("username",e.target.value)}/>
            : form.kind === "openPool" ? <p>開放獎池後將截止選手報名。所有已登入的成員都可以加入獎池，由房主登記月亮幣。</p>
            : form.kind === "score" ? (
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
                  : { create: "建立比賽", removePlayer:"確認移除", enroll:"確認納入", openPool:"確認開放", score: "儲存", settle: "確認結算" }[
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
