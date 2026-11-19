import { useEffect, useRef } from "react";
import { Check, Fish, Waves } from "lucide-react";
import { Button } from "./ui.jsx";
import { makeSchool, makeSeabed, paintTank, tankHeight, tankWidth } from "./aquariumScene.js";
import "./aquarium.css";

function AquariumScene({ count, month }) {
  const canvas = useRef(null);
  const school = useRef([]);
  const repaint = useRef(null);

  useEffect(() => {
    school.current = makeSchool(count, month);
    repaint.current?.();
  }, [count, month]);

  useEffect(() => {
    const node = canvas.current;
    const ctx = node.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const bed = makeSeabed();
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
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
      if (onScreen && !document.hidden && !motion.matches) frame = requestAnimationFrame(draw);
    }
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      resume();
    });
    observer.observe(node);
    motion.addEventListener("change", resume);
    document.addEventListener("visibilitychange", resume);
    repaint.current = resume;
    resume();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      motion.removeEventListener("change", resume);
      document.removeEventListener("visibilitychange", resume);
      repaint.current = null;
    };
  }, []);

  return <canvas ref={canvas} width={tankWidth} height={tankHeight} aria-hidden="true" />;
}

export default function Aquarium({ aquarium, onCheckIn, busy }) {
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
          <span aria-live="polite">本月 {totalCheckIns} 人次</span>
        </div>
      </div>
      <div className="aquarium-stage">
        <AquariumScene count={fishCount} month={month} />
        <span className="aquarium-population" aria-label={`缸內 ${fishCount} 尾魚，上限 ${capacity} 尾`}>
          <Fish size={13} aria-hidden="true" />{fishCount}<span>/ {capacity}</span>
        </span>
      </div>
    </section>
  );
}
