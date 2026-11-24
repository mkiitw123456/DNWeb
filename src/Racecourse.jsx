import { useState } from "react";
import {
  ArrowDownUp,
  ArrowRight,
  Check,
  Clock3,
  Flag,
  Medal,
  Minus,
  Plus,
  Sparkles,
  UsersRound,
  Wallet,
} from "lucide-react";
import { Button } from "./ui.jsx";
import "./racecourse.css";

const races = [
  { id: "R04", time: "20:30", name: "星河盃 · 草地 1200m", status: "即將開跑", entries: 8 },
  { id: "R05", time: "21:00", name: "疾風挑戰 · 草地 1600m", status: "開放下注", entries: 8 },
  { id: "R06", time: "21:30", name: "月影紀念 · 沙地 1400m", status: "即將開放", entries: 6 },
];

const horses = [
  { no: 1, name: "銀河流星", rider: "晨風", odds: "2.8", color: "#dcae68", form: "近 3 場 1-2-1" },
  { no: 2, name: "午夜疾風", rider: "星野", odds: "4.2", color: "#78a9d8", form: "近 3 場 2-1-3" },
  { no: 3, name: "翡翠烈焰", rider: "凜月", odds: "5.6", color: "#79bc9b", form: "近 3 場 3-2-1" },
  { no: 4, name: "赤焰彗星", rider: "飛鳥", odds: "7.5", color: "#e27d77", form: "近 3 場 1-4-2" },
  { no: 5, name: "白銀之翼", rider: "千雪", odds: "9.1", color: "#b4a0da", form: "近 3 場 2-3-4" },
];

const tickets = ["獨贏", "位置", "連贏"];
const amounts = [10, 50, 100, 500];

export default function Racecourse() {
  const [race, setRace] = useState(races[1]);
  const [horse, setHorse] = useState(null);
  const [ticket, setTicket] = useState("獨贏");
  const [amount, setAmount] = useState(50);
  const [placed, setPlaced] = useState(false);

  function placeBet() {
    if (!horse) return;
    setPlaced(true);
    window.setTimeout(() => setPlaced(false), 2800);
  }

  return (
    <main className="racecourse-page">
      <section className="racecourse-hero">
        <img
          className="racecourse-photo"
          src="https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?auto=format&fit=crop&w=2000&q=85"
          alt="賽馬場上奔馳的賽馬"
        />
        <div className="racecourse-hero-copy">
          <span className="racecourse-eyebrow"><Sparkles size={14} /> DDSTAR NIGHT RACING</span>
          <h1>星耀賽馬場</h1>
          <p>選好你的明星賽駒，和公會夥伴一起迎接衝線時刻。</p>
          <div className="racecourse-live"><span /> 今日賽事進行中 <i>·</i> 第 5 場即將開跑</div>
        </div>
        <div className="racecourse-track-mark" aria-hidden="true"><Flag size={16} /> NIGHT CUP <span>1200 M</span></div>
      </section>

      <section className="racecourse-stats" aria-label="賽事即時資訊">
        <div><span><Clock3 size={16} /> 下一場開跑</span><strong>00:08:42</strong><small>第 5 場 · 21:00</small></div>
        <div><span><UsersRound size={16} /> 熱情參與</span><strong>128 <small>位玩家</small></strong><small>公會夥伴正在下注</small></div>
        <div><span><Wallet size={16} /> 本場總注</span><strong>12,450 <small>星幣</small></strong><small>獎池持續累積中</small></div>
        <div><span><Medal size={16} /> 場次</span><strong>第 5 <small>／ 8 場</small></strong><small>星耀之夜 · 第 3 日</small></div>
      </section>

      <section className="racecourse-section">
        <div className="racecourse-section-heading">
          <div><span className="racecourse-kicker">RACE PROGRAM</span><h2>今日賽程</h2></div>
          <span className="racecourse-date">11 月 24 日　星期二</span>
        </div>
        <div className="racecourse-races">
          {races.map((item) => (
            <button key={item.id} className={`racecourse-race ${race.id === item.id ? "is-selected" : ""}`} onClick={() => { setRace(item); setHorse(null); setPlaced(false); }}>
              <span className="racecourse-race-time">{item.time}<small>{item.id}</small></span>
              <span className="racecourse-race-name">{item.name}<small><UsersRound size={13} /> {item.entries} 匹賽駒</small></span>
              <span className={`racecourse-race-status ${item.status === "即將開跑" ? "is-soon" : ""}`}><i />{item.status}</span>
              <ArrowRight size={16} className="racecourse-race-arrow" />
            </button>
          ))}
        </div>
      </section>

      <section className="racecourse-betting">
        <div className="racecourse-field">
          <div className="racecourse-section-heading racecourse-field-heading">
            <div><span className="racecourse-kicker">RACE {race.id}　·　21:00 開跑</span><h2>{race.name}</h2></div>
            <span className="racecourse-open"><span /> 受注中</span>
          </div>
          <div className="racecourse-column-label"><span>馬號 / 賽駒</span><span>近況</span><span>獨贏賠率</span></div>
          <div className="racecourse-horses">
            {horses.map((item) => (
              <button key={item.no} className={`racecourse-horse ${horse?.no === item.no ? "is-picked" : ""}`} onClick={() => { setHorse(item); setPlaced(false); }}>
                <span className="racecourse-saddle" style={{ "--saddle": item.color }}>{String(item.no).padStart(2, "0")}</span>
                <span className="racecourse-horse-name">{item.name}<small>{item.rider}　騎師</small></span>
                <span className="racecourse-form">{item.form}</span>
                <strong className="racecourse-odds">{item.odds}<small>倍</small></strong>
                <span className="racecourse-pick-mark"><Check size={14} /></span>
              </button>
            ))}
          </div>
          <p className="racecourse-demo-note"><Sparkles size={14} /> 展示賽事資料與互動預覽</p>
        </div>

        <aside className="racecourse-bet-slip">
          <div className="racecourse-slip-title"><div><span className="racecourse-kicker">YOUR SELECTION</span><h2>我的投注單</h2></div><span className="racecourse-slip-count">{horse ? "01" : "00"}</span></div>
          <p className="racecourse-slip-race"><Flag size={14} /> {race.id}　{race.name}</p>
          <span className="racecourse-control-label">投注方式</span>
          <div className="racecourse-ticket-tabs" role="group" aria-label="投注方式">
            {tickets.map((item) => <button key={item} aria-pressed={ticket === item} onClick={() => { setTicket(item); setPlaced(false); }}>{item}</button>)}
          </div>
          <div className="racecourse-slip-selection">
            {horse ? <><span className="racecourse-saddle" style={{ "--saddle": horse.color }}>{String(horse.no).padStart(2, "0")}</span><div>{horse.name}<small>{ticket} · {horse.odds} 倍</small></div><button title="清除選擇" aria-label="清除選擇" onClick={() => { setHorse(null); setPlaced(false); }}>×</button></> : <span className="racecourse-empty"><ArrowDownUp size={15} /> 選擇一匹賽駒加入投注單</span>}
          </div>
          <span className="racecourse-control-label">投注金額 <small>星幣</small></span>
          <div className="racecourse-amounts">{amounts.map((value) => <button key={value} className={amount === value ? "is-active" : ""} onClick={() => { setAmount(value); setPlaced(false); }}>{value}</button>)}</div>
          <div className="racecourse-amount-stepper"><button aria-label="減少金額" onClick={() => { setAmount((n) => Math.max(10, n - 10)); setPlaced(false); }}><Minus size={15} /></button><strong>{amount.toLocaleString()} <small>星幣</small></strong><button aria-label="增加金額" onClick={() => { setAmount((n) => n + 10); setPlaced(false); }}><Plus size={15} /></button></div>
          <Button className="racecourse-place-bet" disabled={!horse} onClick={placeBet}>{placed ? <><Check size={16} /> 投注已登記</> : <>確認投注 <ArrowRight size={16} /></>}</Button>
          <p className="racecourse-slip-disclaimer">本頁為介面展示，投注不會扣除積分或寫入紀錄。</p>
        </aside>
      </section>
    </main>
  );
}
