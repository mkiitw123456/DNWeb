import { playSound } from "./sounds.js";
import { animateStarTransfer } from "./star-motion.js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
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
    lastRecordAt: 0,
    pending: null,
  });
  const [announcement, setAnnouncement] = useState("");
  const current = useRef(wallet);
  const layer = useRef(null);
  const target = useRef(null);
  const cancelFlight = useRef(null);

  const update = useCallback((next) => {
    current.current = next;
    setWallet(next);
  }, []);

  const cancel = useCallback(() => {
    cancelFlight.current?.();
    cancelFlight.current = null;
  }, []);

  const sync = useCallback(
    (user, total, lastRecordAt = 0) => {
      const w = current.current;
      if (user !== w.user) {
        cancel();
        setAnnouncement("");
        update({
          user,
          total: total ?? 0,
          shown: total ?? 0,
          lastRecordAt,
          pending: null,
        });
      } else if (Number.isFinite(total) && lastRecordAt >= w.lastRecordAt) {
        // Keep animating the receipt on screen. A later balance from another
        // tab takes effect after the last particle lands.
        update({
          ...w,
          total,
          lastRecordAt,
          shown: w.pending ? w.shown : total,
        });
      }
    },
    [cancel, update],
  );

  const hold = useCallback(
    (record) => {
      const w = current.current;
      if (w.user !== record.memberId || w.pending?.id === record.id) return;
      cancel();
      setAnnouncement("");
      const createdAt = record.createdAt ?? 0;
      update({
        ...w,
        total: w.lastRecordAt > createdAt ? w.total : record.after,
        lastRecordAt: Math.max(w.lastRecordAt, createdAt),
        shown: record.before,
        pending: {
          id: record.id,
          before: record.before,
          delta: record.delta,
          flying: false,
        },
      });
    },
    [cancel, update],
  );

  const settle = useCallback(
    (id) => {
      const w = current.current;
      if (!w.pending || w.pending.id !== id) return;
      cancel();
      update({ ...w, shown: w.total, pending: null });
      const delta = w.pending.delta;
      const change =
        delta > 0
          ? `獲得 ${delta} 顆星星`
          : delta < 0
            ? `扣除 ${-delta} 顆星星`
            : "星星數量不變";
      setAnnouncement(`${change}，累積 ${w.total} 顆。`);
    },
    [cancel, update],
  );

  const release = useCallback(
    (id) => {
      if (!current.current.pending?.flying) settle(id);
    },
    [settle],
  );

  const collect = useCallback(
    (id, emblem) => {
      const w = current.current;
      const pending = w.pending;
      if (!pending || pending.id !== id || pending.flying) return;
      const delta = pending.delta;
      if (delta > 0) playSound("coin");
      const sourceRect = emblem?.getBoundingClientRect();
      const badge = target.current;
      const overlay = layer.current;
      if (
        !delta ||
        document.hidden ||
        !badge?.animate ||
        !overlay ||
        (delta > 0 && !sourceRect?.width)
      ) {
        settle(id);
        return;
      }

      // Keep the animated copy above the native result dialog, even when the
      // confirmation immediately opens the next chapter or closes the panel.
      overlay.hidePopover?.();
      overlay.showPopover?.();
      const walletRect = badge.getBoundingClientRect();
      if (!walletRect.width) {
        settle(id);
        return;
      }
      update({ ...w, pending: { ...pending, flying: true } });
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      if (delta > 0) emblem.style.visibility = "hidden";
      let moved = 0;
      const onStar = () => {
        const latest = current.current;
        if (latest.pending?.id !== id) return;
        moved++;
        if (!reduced && !badge.getAnimations().length) {
          badge.animate(
            [
              { transform: "scale(1)" },
              { transform: "scale(1.14)" },
              { transform: "scale(1)" },
            ],
            { duration: 150 },
          );
        }
        if (moved === Math.abs(delta)) settle(id);
        else
          update({
            ...latest,
            shown: pending.before + Math.sign(delta) * moved,
          });
      };
      cancelFlight.current = animateStarTransfer({
        layer: overlay,
        sourceRect,
        walletRect,
        asset: STAR_ASSET,
        delta,
        reduced,
        onStar,
      });
    },
    [settle, update],
  );

  useEffect(() => {
    if (wallet.user && layer.current) {
      layer.current.hidePopover?.();
      layer.current.showPopover?.();
    }
  }, [wallet.user, wallet.pending?.id]);

  useEffect(() => {
    const onVisibility = () => {
      const pending = current.current.pending;
      if (pending?.flying && document.hidden) settle(pending.id);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      cancel();
    };
  }, [cancel, settle]);

  const value = useMemo(
    () => ({ sync, hold, collect, release }),
    [sync, hold, collect, release],
  );
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
