import AdventurerInn from "./AdventurerInn.jsx";
import { ScenerySelect, useLobbyScenery } from "./LobbyScenery.jsx";
import NightSky from "./NightSky.jsx";
import { useEffect, useRef, useState } from "react";
import { Check, Fish, Stars, CalendarCheck, Beer, Pause, Play, Waves } from "lucide-react";
import { Button } from "./ui.jsx";
import { makeSchool, makeSeabed, paintTank, tankHeight, tankWidth } from "./aquariumScene.js";
import "./aquarium.css";

function useSceneMotion(key, respectReducedMotion = false) {
  const media = "(prefers-reduced-motion: reduce)";
  function read() {
    try {
      const choice = localStorage.getItem(key);
      if (choice === "play" || choice === "pause") return choice === "play";
    } catch { /* Use the default for this visit. */ }
    return !respectReducedMotion || !window.matchMedia(media).matches;
  }
  const [playing, setPlaying] = useState(read);
  useEffect(() => {
    const preference = window.matchMedia(media);
    const sync = () => setPlaying(read());
    const storage = event => { if (event.key === key || event.key === null) sync(); };
    window.addEventListener("storage", storage);
    if (respectReducedMotion) preference.addEventListener("change", sync);
    return () => {
      window.removeEventListener("storage", storage);
      preference.removeEventListener("change", sync);
    };
  }, [key, respectReducedMotion]);
  function toggle() {
    setPlaying(!playing);
    try { localStorage.setItem(key, playing ? "pause" : "play"); }
    catch { /* Keep the choice for this visit. */ }
  }
  return { playing, toggle };
}

function AquariumScene({ count, month, playing }) {
  const canvas = useRef(null);
  const school = useRef([]);
  const repaint = useRef(null);
  const enabled = useRef(playing);

  useEffect(() => {
    school.current = makeSchool(count, month);
    repaint.current?.();
  }, [count, month]);

  useEffect(() => {
    enabled.current = playing;
    repaint.current?.();
  }, [playing]);

  useEffect(() => {
    const node = canvas.current;
    const ctx = node.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const bed = makeSeabed();
    let onScreen = true;
    let frame = 0;
    let previous = null;
    let elapsed = 0;
    function draw(now) {
      if (previous === null || now - previous >= 1000 / 30) {
        if (previous !== null) elapsed += (now - previous) / 1000;
        previous = now;
        paintTank(ctx, bed, school.current, elapsed);
      }
      frame = requestAnimationFrame(draw);
    }
    function resume() {
      cancelAnimationFrame(frame);
      previous = null;
      paintTank(ctx, bed, school.current, elapsed);
      if (enabled.current && onScreen && !document.hidden) frame = requestAnimationFrame(draw);
    }
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      resume();
    });
    observer.observe(node);
    document.addEventListener("visibilitychange", resume);
    repaint.current = resume;
    resume();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", resume);
      repaint.current = null;
    };
  }, []);

  return <canvas ref={canvas} width={tankWidth} height={tankHeight} aria-hidden="true" />;
}

export default function Aquarium({ aquarium, onCheckIn, busy, memberId }) {
  const [scene, chooseScene] = useLobbyScenery(memberId);
  const fishMotion = useSceneMotion("ddstar-aquarium-motion");
  const skyMotion = useSceneMotion("ddstar-sky-motion", true);
  const innMotion = useSceneMotion("ddstar-inn-motion", true);
  if (!aquarium) return null;
  const { month, fishCount, capacity, checkedInToday, totalCheckIns } = aquarium;
  const full = fishCount >= capacity;
  const tank = scene === "aquarium";
  const sky = scene === "sky";
  const inn = scene === "inn";
  const { playing, toggle } = inn ? innMotion : sky ? skyMotion : fishMotion;
  const Icon = tank ? Fish : sky ? Stars : inn ? Beer : CalendarCheck;
  return (
    <section className={`guild-aquarium scenery-${scene}`} aria-labelledby="aquarium-title">
      <div className="aquarium-copy">
        <div className="scenery-heading">
          <div className="aquarium-season">{tank ? <Waves size={15} /> : <Icon size={15} />}{Number(month.slice(-2))} 月公會簽到</div>
          <ScenerySelect value={scene} onChange={chooseScene} />
        </div>
        <h2 id="aquarium-title">{tank ? "潮汐水族箱" : sky ? "山頂觀星台" : inn ? "冒險者旅店" : "每日簽到"}</h2>
        {tank && <p>{full ? "魚缸住滿了！每次簽到仍會計入本月紀錄。" : "每人每天簽到一次，為魚缸添一尾魚。"}</p>}
        {sky && <p>{full ? "本月星圖已點亮，簽到仍會計入本月紀錄。" : "每次公會簽到，都會在山脊上方點亮一顆星。"}</p>}
        {inn && <p>{full ? "旅店客滿了。下一位客人進門前，會有人起身讓座。" : "每次公會簽到，就有一位冒險者推門入座。"}</p>}
        <div className="aquarium-actions">
          <Button primary={!checkedInToday} disabled={busy || checkedInToday} onClick={onCheckIn}>
            {checkedInToday ? <Check size={15} /> : <Icon size={15} />}
            {checkedInToday ? "今日已簽到" : "今日簽到"}
          </Button>
          {(tank || sky || inn) && <Button type="button" onClick={toggle}>
            {playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
            {playing ? "暫停" : "播放"}{tank ? "魚群" : inn ? "旅店動畫" : "星空"}
          </Button>}
          <span aria-live="polite">本月 {totalCheckIns} 人次</span>
        </div>
      </div>
      {scene !== "simple" && <div className="aquarium-stage">
        {tank ? <AquariumScene count={fishCount} month={month} playing={playing} /> : inn ? <AdventurerInn key={month} total={totalCheckIns} playing={playing} /> : <NightSky count={fishCount} playing={playing} />}
        <span className="aquarium-population" aria-label={tank ? `缸內 ${fishCount} 尾魚，上限 ${capacity} 尾` : inn ? `已入店 ${fishCount} 人，共 ${capacity} 席` : `已點亮 ${fishCount} 顆星，上限 ${capacity} 顆`}>
          <Icon size={13} aria-hidden="true" />{fishCount}<span>/ {capacity}</span>
        </span>
      </div>}
    </section>
  );
}
