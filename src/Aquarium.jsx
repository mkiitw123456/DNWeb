import { ScenerySelect, useLobbyScenery } from "./LobbyScenery.jsx";
import NightSky from "./NightSky.jsx";
import { useEffect, useRef, useState } from "react";
import { Check, Fish, Stars, Pause, Play, Waves } from "lucide-react";
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
  if (!aquarium) return null;
  return <SceneryCard key={scene} {...{ aquarium, onCheckIn, busy, scene, chooseScene }} />;
}

function SceneryCard({ aquarium, onCheckIn, busy, scene, chooseScene }) {
  const { day, fishCount, capacity, checkedInToday, totalCheckIns } = aquarium;
  const full = fishCount >= capacity;
  const tank = scene === "aquarium", sky = scene === "sky";
  const motionName = tank ? "魚群" : "星空";
  const { playing, toggle } = useSceneMotion(`ddstar-${scene}-motion`, !tank);
  const Icon = tank ? Fish : Stars;
  const population = tank ? `缸內 ${fishCount} 尾魚，上限 ${capacity} 尾` : `已點亮 ${fishCount} 顆星，上限 ${capacity} 顆`;
  return (
    <section className={`guild-aquarium scenery-${scene}`} aria-labelledby="aquarium-title">
      <div className="aquarium-copy">
        <div className="scenery-heading">
          <div className="aquarium-season">{tank ? <Waves size={15} /> : <Icon size={15} />}公會簽到 · 每日上午 9 點更新</div>
          <ScenerySelect value={scene} onChange={chooseScene} />
        </div>
        <h2 id="aquarium-title">{tank ? "潮汐水族箱" : "山頂觀星台"}</h2>
        {tank && <p>{full ? "魚缸住滿了！每次簽到仍會計入今日紀錄。" : "每人每天簽到一次，為魚缸添一尾魚。"}</p>}
        {sky && <p>{full ? "今日星圖已點亮，簽到仍會計入今日紀錄。" : "每次公會簽到，都會在山脊上方點亮一顆星。"}</p>}
        <div className="aquarium-actions">
          <Button primary={!checkedInToday} disabled={busy || checkedInToday} onClick={onCheckIn}>
            {checkedInToday ? <Check size={15} /> : <Icon size={15} />}
            {checkedInToday ? "今日已簽到" : "今日簽到"}
          </Button>
          <Button type="button" onClick={toggle}>
            {playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
            {playing ? "暫停" : "播放"}{motionName}
          </Button>
          <span aria-live="polite">今日 {totalCheckIns} 人次</span>
        </div>
      </div>
      <div className="aquarium-stage">
        {tank ? <AquariumScene count={fishCount} month={day} playing={playing} /> : <NightSky count={fishCount} playing={playing} />}
        <span className="aquarium-population" aria-label={population}>
          <Icon size={13} aria-hidden="true" />{fishCount}<span>/ {capacity}</span>
        </span>
      </div>
    </section>
  );
}
