import { useEffect, useRef, useState } from "react";
import { Check, Fish, Pause, Play, Waves } from "lucide-react";
import { Button } from "./ui.jsx";
import { makeSchool, makeSeabed, paintTank, tankHeight, tankWidth } from "./aquariumScene.js";
import "./aquarium.css";

const motionKey = "ddstar-aquarium-motion";

function shouldPlayAquarium() {
  try {
    return localStorage.getItem(motionKey) !== "pause";
  } catch {
    return true;
  }
}

function useAquariumMotion() {
  const [playing, setPlaying] = useState(shouldPlayAquarium);
  useEffect(() => {
    const syncChoice = (event) => {
      if (event.key === motionKey || event.key === null) setPlaying(shouldPlayAquarium());
    };
    window.addEventListener("storage", syncChoice);
    return () => window.removeEventListener("storage", syncChoice);
  }, []);
  function toggle() {
    setPlaying(!playing);
    try {
      localStorage.setItem(motionKey, playing ? "pause" : "play");
    } catch {
      // Keep the choice for this visit when storage is unavailable.
    }
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

export default function Aquarium({ aquarium, onCheckIn, busy }) {
  const { playing, toggle } = useAquariumMotion();
  if (!aquarium) return null;
  const { month, fishCount, capacity, checkedInToday, totalCheckIns } = aquarium;
  const full = fishCount >= capacity;
  return (
    <section className="guild-aquarium" aria-labelledby="aquarium-title">
      <div className="aquarium-copy">
        <div className="aquarium-season"><Waves size={15} aria-hidden="true" />{Number(month.slice(-2))} 月公會共養</div>
        <h2 id="aquarium-title">潮汐水族箱</h2>
        <p>{full ? "魚缸住滿了！每次簽到仍會計入本月紀錄。" : "每人每天簽到一次，為魚缸添一尾魚。"}</p>
        <div className="aquarium-actions">
          <Button primary={!checkedInToday} disabled={busy || checkedInToday} onClick={onCheckIn}>
            {checkedInToday ? <Check size={15} /> : <Fish size={15} />}
            {checkedInToday ? "今日已簽到" : "今日簽到"}
          </Button>
          <Button type="button" onClick={toggle}>
            {playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
            {playing ? "暫停魚群" : "播放魚群"}
          </Button>
          <span aria-live="polite">本月 {totalCheckIns} 人次</span>
        </div>
      </div>
      <div className="aquarium-stage">
        <AquariumScene count={fishCount} month={month} playing={playing} />
        <span className="aquarium-population" aria-label={`缸內 ${fishCount} 尾魚，上限 ${capacity} 尾`}>
          <Fish size={13} aria-hidden="true" />{fishCount}<span>/ {capacity}</span>
        </span>
      </div>
    </section>
  );
}
