import { ScenerySelect, useLobbyScenery } from "./LobbyScenery.jsx";
import NightSky from "./NightSky.jsx";
import { useEffect, useRef, useState } from "react";
import { Check, Fish, Stars, Pause, Play, Waves, RotateCcw, Orbit, BookOpen } from "lucide-react";
import FishGuide, {FishPortrait} from "./FishGuide.jsx";
import { fishById, fishTiers } from "../shared/fish-catalog.js";
import { Button } from "./ui.jsx";
import { reconcileSchool, makeSeabed, renderSeabed, makeFrame, paintTank, tankCamera, tankHeight, tankWidth } from "./aquariumScene.js";
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

function AquariumScene({ total, capacity, day, playing, species }) {
  const canvas = useRef(null);
  const school = useRef(null);
  const elapsed = useRef(0);
  const repaint = useRef(null);
  const enabled = useRef(playing);
  const resetView = useRef(null);

  useEffect(() => {
    enabled.current = playing;
    school.current = reconcileSchool(school.current, total, day, capacity, elapsed.current, playing, species);
    repaint.current?.();
  }, [total, capacity, day, playing, species]);

  useEffect(() => {
    const node = canvas.current;
    const ctx = node.getContext("2d");
    if (!ctx) return;
    const geometry = makeSeabed(), bed = makeFrame(), buffer = makeFrame();
    let camera = tankCamera(), drag = null;
    let lamp;
    function readLamp() {
      return parseInt(getComputedStyle(node).getPropertyValue("--accent").trim().slice(1), 16) || 0;
    }
    lamp = readLamp();
    let onScreen = true, frame = 0, previous = null;
    function paint() {
      if (bed.camera !== camera) renderSeabed(bed, geometry, camera, lamp);
      const { fish, arrivals } = school.current;
      paintTank(ctx, bed, buffer, fish, elapsed.current, arrivals);
    }
    function draw(now) {
      frame = 0;
      if (previous === null || bed.camera !== camera || now - previous >= 1000 / 30 - 1) {
        if (enabled.current && previous !== null) elapsed.current += Math.min(.1, (now - previous) / 1000);
        previous = now;
        paint();
      }
      if (enabled.current) frame = requestAnimationFrame(draw);
    }
    function setView(next) {
      camera = next;
      if (!frame && onScreen && !document.hidden) frame = requestAnimationFrame(draw);
    }
    resetView.current = () => setView(tankCamera());
    function startDrag(event) {
      if (!event.isPrimary || event.button !== 0 || drag) return;
      const bounds = node.getBoundingClientRect();
      drag = {id: event.pointerId, x: event.clientX, y: event.clientY, width: bounds.width, height: bounds.height};
      node.setPointerCapture(event.pointerId);
      node.classList.add("is-dragging");
    }
    function moveDrag(event) {
      if (event.pointerId !== drag?.id) return;
      const dx = (event.clientX - drag.x) / drag.width;
      const dy = (event.clientY - drag.y) / drag.height;
      drag.x = event.clientX;
      drag.y = event.clientY;
      setView(tankCamera(camera.yaw - dx * 2 * Math.PI, camera.pitch + dy * 2));
    }
    function endDrag(event) {
      if (event.pointerId !== drag?.id) return;
      drag = null;
      node.classList.remove("is-dragging");
      if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
    }
    function keyDown(event) {
      const steps = {ArrowLeft: [-.15, 0], ArrowRight: [.15, 0], ArrowUp: [0, .1], ArrowDown: [0, -.1]};
      if (event.key === "Home") resetView.current();
      else if (steps[event.key]) {
        const [x, y] = steps[event.key];
        setView(tankCamera(camera.yaw + x, camera.pitch + y));
      } else return;
      event.preventDefault();
    }
    function resume() {
      cancelAnimationFrame(frame);
      frame = 0;
      previous = null;
      if (onScreen && !document.hidden) {
        paint();
        if (enabled.current) frame = requestAnimationFrame(draw);
      }
    }
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      resume();
    });
    observer.observe(node);
    const themeObserver = new MutationObserver(() => {
      const next = readLamp();
      if (next === lamp) return;
      lamp = next;
      bed.camera = null;
      resume();
    });
    themeObserver.observe(document.documentElement, {attributes:true, attributeFilter:["style","class"]});
    const controls = {pointerdown: startDrag, pointermove: moveDrag, pointerup: endDrag, pointercancel: endDrag, lostpointercapture: endDrag, keydown: keyDown};
    for (const [name, handler] of Object.entries(controls)) node.addEventListener(name, handler);
    document.addEventListener("visibilitychange", resume);
    repaint.current = resume;
    resume();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      themeObserver.disconnect();
      for (const [name, handler] of Object.entries(controls)) node.removeEventListener(name, handler);
      resetView.current = null;
      document.removeEventListener("visibilitychange", resume);
      repaint.current = null;
    };
  }, []);
  return <>
    <canvas ref={canvas} width={tankWidth} height={tankHeight} tabIndex={0} role="img"
      aria-label="立體水族箱，拖曳或使用方向鍵旋轉，Home 鍵回到預設視角" />
    <span className="aquarium-orbit-hint" aria-hidden="true"><Orbit size={13} />拖曳旋轉</span>
    <button type="button" className="aquarium-reset-view" aria-label="重設水族箱視角" title="重設視角" onClick={() => resetView.current?.()}><RotateCcw size={15} /></button>
  </>;
}

export default function Aquarium({ aquarium, onCheckIn, busy, memberId }) {
  const [scene, chooseScene] = useLobbyScenery(memberId);
  if (!aquarium) return null;
  return <SceneryCard key={scene} {...{ aquarium, onCheckIn, busy, scene, chooseScene }} />;
}

function SceneryCard({ aquarium, onCheckIn, busy, scene, chooseScene }) {
  const [guideOpen, setGuideOpen] = useState(false);
  const { day, fishCount, capacity, checkedInToday, totalCheckIns } = aquarium;
  const full = fishCount >= capacity;
  const tank = scene === "aquarium", sky = scene === "sky";
  const motionName = tank ? "魚群" : "星空";
  const { playing, toggle } = useSceneMotion(`ddstar-${scene}-motion`, !tank);
  const Icon = tank ? Fish : Stars;
  const catchOfDay = fishById.get(aquarium.todayFish);
  const population = tank ? `缸內 ${fishCount} 尾魚，上限 ${capacity} 尾` : `已點亮 ${fishCount} 顆星，上限 ${capacity} 顆`;
  return (
    <section className={`guild-aquarium scenery-${scene}`} aria-labelledby="aquarium-title">
      <div className="aquarium-copy">
        <div className="scenery-heading">
          <div className="aquarium-season">{tank ? <Waves size={15} /> : <Icon size={15} />}公會簽到 · 每日上午 9 點更新</div>
          <ScenerySelect value={scene} onChange={chooseScene} />
        </div>
        <h2 id="aquarium-title">{tank ? "潮汐水族箱" : "山頂觀星台"}</h2>
        {tank && <p>{full ? "魚缸滿座了，新抽到的魚會接替一尾夥伴。" : "每天簽到抽一尾魚，加入公會魚缸與你的圖鑑。"}</p>}
        {sky && <p>{full ? "今日星圖已點亮，簽到仍會計入今日紀錄。" : "每次公會簽到，都會在山脊上方點亮一顆星。"}</p>}
        <div className="aquarium-actions">
          <Button primary={!checkedInToday} disabled={busy || checkedInToday} onClick={onCheckIn}>
            {checkedInToday ? <Check size={15} /> : <Icon size={15} />}
            {aquarium.checking ? "簽到同步中…" : checkedInToday ? "今日已簽到" : "今日簽到"}
          </Button>
          <Button type="button" onClick={toggle}>
            {playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
            {playing ? "暫停" : "播放"}{motionName}
          </Button>
          <Button type="button" onClick={()=>setGuideOpen(true)}><BookOpen size={14} />魚種圖鑑</Button>
          <span aria-live="polite">今日 {totalCheckIns} 人次</span>
        </div>
        {catchOfDay && <button type="button" className="daily-fish" onClick={()=>setGuideOpen(true)}
          style={{"--fish-ink":fishTiers[catchOfDay.tier].color}}>
          <FishPortrait species={catchOfDay} /><span><small>今日漁獲 · {fishTiers[catchOfDay.tier].name}</small><strong>{catchOfDay.name}</strong></span>
        </button>}
      </div>
      <div className="aquarium-stage">
        {tank ? <AquariumScene total={totalCheckIns} capacity={capacity} day={day} playing={playing} species={aquarium.species} /> : <NightSky count={fishCount} playing={playing} />}
        <span className="aquarium-population" aria-label={population}>
          <Icon size={13} aria-hidden="true" />{fishCount}<span>/ {capacity}</span>
        </span>
      </div>
      {guideOpen && <FishGuide aquarium={aquarium} onClose={()=>setGuideOpen(false)} />}
    </section>
  );
}
