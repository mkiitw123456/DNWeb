import { useEffect, useRef, useState } from "react";
import { Check, Waves } from "lucide-react";
import { fishById, fishCatalog, fishTiers } from "../shared/fish-catalog.js";
import { makeFrame, paintFishPortrait } from "./aquariumScene.js";
import { Modal } from "./ui.jsx";

export function FishPortrait({ species, animated = false }) {
  const canvas = useRef(null);
  useEffect(() => {
    const node = canvas.current;
    const ctx = node.getContext("2d");
    if (!ctx) return;
    const frame = makeFrame(node.width, node.height);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let timer,
      elapsed = 0;
    function sync() {
      clearInterval(timer);
      paintFishPortrait(ctx, frame, species, elapsed);
      if (animated && !document.hidden && !reduced.matches) {
        timer = setInterval(
          () => paintFishPortrait(ctx, frame, species, (elapsed += 0.06)),
          60,
        );
      }
    }
    sync();
    if (!animated) return;
    document.addEventListener("visibilitychange", sync);
    reduced.addEventListener("change", sync);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
      reduced.removeEventListener("change", sync);
    };
  }, [species, animated]);
  return (
    <canvas
      className="fish-portrait"
      ref={canvas}
      width={animated ? 152 : 76}
      height={animated ? 74 : 38}
      aria-hidden="true"
    />
  );
}

export default function FishGuide({ aquarium, onClose }) {
  const collection = aquarium.collection ?? {};
  const [tier, setTier] = useState(null);
  const [id, setId] = useState(
    () =>
      aquarium.todayFish ||
      fishCatalog.find((f) => collection[f.id])?.id ||
      fishCatalog[0].id,
  );
  const selected = fishById.get(id) ?? fishCatalog[0];
  const grade = fishTiers[selected.tier];
  const entries = fishCatalog.filter((f) => tier === null || f.tier === tier);
  const owned = fishCatalog.filter((f) => collection[f.id]).length;
  function filter(nextTier) {
    setTier(nextTier);
    if (nextTier !== null && selected.tier !== nextTier)
      setId(fishCatalog.find((f) => f.tier === nextTier).id);
  }
  return (
    <Modal title="魚種圖鑑" className="fish-guide" onClose={onClose}>
      <div className="fish-guide-toolbar">
        <div className="fish-tier-filters" role="group" aria-label="稀有度">
          {[
            { name: "全部", value: null },
            ...fishTiers.map((t, i) => ({ name: t.name, value: i })),
          ].map((t) => (
            <button
              key={t.name}
              type="button"
              aria-pressed={tier === t.value}
              onClick={() => filter(t.value)}
            >
              {t.name}
            </button>
          ))}
        </div>
        <span>
          已收錄{" "}
          <strong>
            {owned} / {fishCatalog.length}
          </strong>
        </span>
      </div>
      <div className="fish-guide-layout">
        <article
          className="fish-specimen"
          style={{ "--fish-ink": grade.color }}
        >
          <div className="fish-specimen-window">
            <span className="fish-tier-label">{grade.name}</span>
            <FishPortrait species={selected} animated />
            <span className="fish-accession">
              No. {String(fishCatalog.indexOf(selected) + 1).padStart(2, "0")}
            </span>
          </div>
          <div className="fish-specimen-text">
            <h3>{selected.name}</h3>
            <p>{selected.note}</p>
            <div>
              <span>
                {collection[id] ? `已收錄 ${collection[id]} 尾` : "尚未收錄"}
              </span>
              <span>
                {grade.name}出現率 {grade.rate}%
              </span>
            </div>
          </div>
        </article>
        <div className="fish-guide-grid" role="group" aria-label="選擇魚種">
          {entries.map((f) => (
            <button
              key={f.id}
              type="button"
              className="fish-tile"
              aria-pressed={selected.id === f.id}
              aria-label={`${f.name}，${fishTiers[f.tier].name}，${collection[f.id] ? "已收錄" : "尚未收錄"}`}
              style={{ "--fish-ink": fishTiers[f.tier].color }}
              onClick={() => setId(f.id)}
            >
              <FishPortrait species={f} />
              <span>{f.name}</span>
              {collection[f.id] > 0 && (
                <Check className="fish-owned" size={13} aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
      </div>
      <p className="fish-guide-note">
        <Waves size={14} />
        每日簽到抽一尾魚。水族箱每日換缸，圖鑑會保留，重複抽到會累計尾數。
      </p>
    </Modal>
  );
}
