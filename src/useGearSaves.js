import { useEffect, useRef, useState } from "react";
import { apiRequest } from "./api.js";
import { notify } from "./FeedbackHost.jsx";
import { gearSlots } from "../shared/gear.js";

// Keep edits above the page so navigating away doesn't interrupt a save.
export default function useGearSaves(setData, revision, refreshShell) {
  const drafts = useRef(new Map());
  const inFlight = useRef(null);
  const hasPending = useRef(false);
  const timer = useRef(null);
  const batchStarted = useRef(0);
  const writer = useRef(null);
  const [pending, setPending] = useState({});
  const saving = Object.keys(pending).length > 0;

  useEffect(() => {
    if (!saving) return;
    const onUnload = (event) => {
      event.preventDefault();
      event.returnValue = true;
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [saving]);

  function publish() {
    const changes = Object.fromEntries(drafts.current);
    if (inFlight.current) {
      const { id, patch } = inFlight.current;
      changes[id] = { ...patch, ...changes[id] };
    }
    hasPending.current = !!inFlight.current || drafts.current.size > 0;
    setPending(changes);
  }

  async function drain() {
    let hadFailure = false;
    let reconcile = false;
    while (drafts.current.size) {
      const [id, patch] = drafts.current.entries().next().value;
      drafts.current.delete(id);
      inFlight.current = { id, patch };
      try {
        const { gear } = await apiRequest("character.gear", {
          id,
          gear: patch,
        });
        revision.current++;
        setData(
          (state) =>
            state && {
              ...state,
              characters: state.characters.map((c) =>
                c.id === id && c.ownerId === state.me.id ? { ...c, gear } : c,
              ),
            },
        );
      } catch (error) {
        if (error.status === 401) {
          revision.current++;
          drafts.current.clear();
          inFlight.current = null;
          publish();
          setData(null);
          notify("登入已失效，請重新登入後儲存裝備", "error");
          return;
        }
        // A lost response may have been committed. Fetch the authoritative state.
        if (!error.status || error.status >= 500) reconcile = true;
        const latest = drafts.current.get(id) || {};
        const failedSlots = gearSlots
          .filter(
            ({ id: slot }) =>
              Object.hasOwn(patch, slot) && !Object.hasOwn(latest, slot),
          )
          .map(({ label }) => label);
        if (failedSlots.length) {
          hadFailure = true;
          notify(
            `裝備儲存失敗（${failedSlots.join("、")}） · ${error.message || "連線失敗"}`,
            "error",
          );
        }
      }

      // Keep any newer selections queued while the previous patch was in flight.
      inFlight.current = null;
      publish();
    }
    if (!hadFailure) notify("裝備階級已更新");
    if (reconcile) refreshShell.current?.();
  }

  function flush() {
    clearTimeout(timer.current);
    timer.current = null;
    batchStarted.current = 0;
    if (!writer.current && drafts.current.size) {
      writer.current = drain().finally(() => {
        writer.current = null;
      });
    }
    return writer.current;
  }

  function changeGear(id, slot, grade) {
    revision.current++;
    drafts.current.set(id, { ...drafts.current.get(id), [slot]: grade });
    publish();
    if (writer.current) return;
    // Save after a short pause, or within 900 ms if selections keep arriving.
    const now = performance.now();
    if (timer.current === null) batchStarted.current = now;
    clearTimeout(timer.current);
    timer.current = setTimeout(
      flush,
      Math.min(300, Math.max(0, 900 - (now - batchStarted.current))),
    );
  }

  return { pending, changeGear, flush, hasPending };
}
