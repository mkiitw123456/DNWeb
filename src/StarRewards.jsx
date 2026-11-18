import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import "./star-rewards.css";

const Context = createContext(null);
export const useStarRewards = () => useContext(Context);
export const STAR_ASSET = "/ddstar-reward-star.png";
export default function StarRewardsProvider({ children }) {
  const [wallet, setWallet] = useState({
    user: null,
    total: 0,
    shown: 0,
    pending: null,
  });
  const [announcement, setAnnouncement] = useState("");
  const current = useRef(wallet),
    layer = useRef(null),
    target = useRef(null);
  const jobs = useRef([]),
    generation = useRef(0);
  const update = useCallback((fn) => {
    const next = fn(current.current);
    current.current = next;
    setWallet(next);
  }, []);
  const cancel = useCallback(() => {
    generation.current++;
    for (const { element, animation } of jobs.current) {
      animation.cancel();
      element.remove();
    }
    jobs.current = [];
  }, []);
  const sync = useCallback(
    (user, total) => {
      if (user !== current.current.user) {
        cancel();
        update(() => ({
          user,
          total: total ?? 0,
          shown: total ?? 0,
          pending: null,
        }));
        return;
      }
      if (Number.isFinite(total) && !current.current.pending)
        update((w) => ({ ...w, total, shown: total }));
    },
    [cancel, update],
  );
  const hold = useCallback(
    (record) => {
      if (current.current.pending?.id === record.id) return;
      cancel();
      update((w) => ({
        ...w,
        total: record.after,
        shown: record.before,
        pending: {
          id: record.id,
          before: record.before,
          after: record.after,
          delta: record.delta,
          flying: false,
        },
      }));
    },
    [cancel, update],
  );
  const collect = useCallback(
    (rect) => {
      const pending = current.current.pending;
      if (!pending || pending.flying) return;
      const finish = () =>
        update((w) => ({
          ...w,
          shown: pending.after,
          total: pending.after,
          pending: null,
        }));
      const count = Math.max(0, pending.delta);
      if (!count || !target.current || !layer.current) {
        finish();
        return;
      }
      update((w) => ({ ...w, pending: { ...w.pending, flying: true } }));
      layer.current.hidePopover?.();
      layer.current.showPopover?.();
      const end = target.current.getBoundingClientRect();
      const from = {
        x: rect ? rect.x + rect.width / 2 : innerWidth / 2,
        y: rect ? rect.y + rect.height / 2 : innerHeight / 2,
      };
      const to = { x: end.x + end.width / 2, y: end.y + end.height / 2 };
      const batch = generation.current;
      let arrived = 0;
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      for (let i = 0; i < count; i++) {
        const element = document.createElement("img");
        element.src = STAR_ASSET;
        element.alt = "";
        element.className = "reward-flying-star";
        layer.current.append(element);
        const spread = ((i % 7) - 3) * 14;
        const transform = (x, y, scale, rotation) =>
          `translate3d(${x - 14}px,${y - 14}px,0) scale(${scale}) rotate(${rotation}deg)`;
        const frames = reduced
          ? [
              { transform: transform(to.x, to.y, 0.6, 0), opacity: 0 },
              {
                transform: transform(to.x, to.y, 1, 0),
                opacity: 1,
                offset: 0.6,
              },
              { transform: transform(to.x, to.y, 0.5, 0), opacity: 0 },
            ]
          : [
              { transform: transform(from.x, from.y, 0.3, 0), opacity: 0 },
              {
                transform: transform(
                  from.x + spread,
                  from.y - 45 - (i % 3) * 14,
                  1.2,
                  35,
                ),
                opacity: 1,
                offset: 0.22,
              },
              {
                transform: transform(
                  from.x + (to.x - from.x) * 0.45 + spread,
                  to.y + (from.y - to.y) * 0.28,
                  1,
                  100,
                ),
                opacity: 1,
                offset: 0.65,
              },
              { transform: transform(to.x, to.y, 0.35, 180), opacity: 0 },
            ];
        const animation = element.animate(frames, {
          duration: reduced ? 350 : 850,
          delay: i * Math.max(12, Math.min(85, 1600 / count)),
          easing: "cubic-bezier(.3,0,.6,1)",
          fill: "both",
        });
        jobs.current.push({ element, animation });
        animation.onfinish = () => {
          element.remove();
          if (generation.current !== batch) return;
          arrived++;
          update((w) => ({ ...w, shown: pending.before + arrived }));
          target.current?.animate(
            [
              { transform: "scale(1)" },
              { transform: "scale(1.18)" },
              { transform: "scale(1)" },
            ],
            { duration: 150 },
          );
          if (arrived === count) {
            jobs.current = [];
            finish();
            setAnnouncement(
              `已獲得 ${count} 顆星星，累積 ${pending.after} 顆。`,
            );
          }
        };
      }
    },
    [update],
  );
  useEffect(() => {
    if (wallet.user && layer.current) {
      layer.current.hidePopover?.();
      layer.current.showPopover?.();
    }
  }, [wallet.user, wallet.pending?.id]);
  useEffect(() => {
    const interrupted = () => {
      if (!current.current.pending?.flying || !document.hidden) return;
      const after = current.current.pending.after;
      cancel();
      update((w) => ({ ...w, total: after, shown: after, pending: null }));
    };
    document.addEventListener("visibilitychange", interrupted);
    return () => {
      document.removeEventListener("visibilitychange", interrupted);
      cancel();
    };
  }, [cancel, update]);
  const value = useMemo(() => ({ sync, hold, collect }), [sync, hold, collect]);
  return (
    <Context.Provider value={value}>
      {children}
      {wallet.user && (
        <div ref={layer} popover="manual" className="star-reward-layer">
          <div className="star-wallet" aria-label={`累積星星 ${wallet.shown}`}>
            <img ref={target} src={STAR_ASSET} width="34" height="34" alt="" />
            <div>
              <small>累積星星</small>
              <strong>{wallet.shown.toLocaleString("zh-TW")}</strong>
            </div>
          </div>
          <span className="star-announcement" role="status" aria-live="polite">
            {announcement}
          </span>
        </div>
      )}
    </Context.Provider>
  );
}
