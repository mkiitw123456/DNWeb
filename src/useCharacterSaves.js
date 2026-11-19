import { useEffect, useRef, useState } from "react";
import { apiRequest } from "./api.js";
import { notify } from "./FeedbackHost.jsx";
import { gearSlots } from "../shared/gear.js";

function mergeChanges(previous, patch) {
  const merged = { ...previous };
  for (const [field, edits] of Object.entries(patch)) {
    merged[field] = { ...previous?.[field], ...edits };
  }
  return merged;
}

// Drafts survive navigation. Writes share the shell FIFO with character forms
// so renames, deletes and later inline edits reach the server in click order.
export default function useCharacterSaves(
  setData,
  revision,
  refreshShell,
  enqueueWrite,
  session,
) {
  const drafts = useRef(new Map());
  const draftSession = useRef(null);
  const batches = useRef(new Map());
  const lastSave = useRef(null);
  const hasPending = useRef(false);
  const timer = useRef(null);
  const batchStarted = useRef(0);
  const outcome = useRef({});
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
    const changes = {};
    for (const batch of [...batches.current.keys(), drafts.current]) {
      for (const [id, patch] of batch)
        changes[id] = mergeChanges(changes[id], patch);
    }
    hasPending.current = Object.keys(changes).length > 0;
    setPending(changes);
    return changes;
  }

  function discardExpired() {
    let changed = false;
    if (draftSession.current && !draftSession.current.isCurrent()) {
      drafts.current.clear();
      draftSession.current = null;
      clearTimeout(timer.current);
      timer.current = null;
      changed = true;
    }
    for (const [batch, owner] of batches.current) {
      if (owner.isCurrent()) continue;
      batch.clear();
      batches.current.delete(batch);
      changed = true;
    }
    if (changed) {
      outcome.current = {};
      publish();
    }
  }
  useEffect(discardExpired, [session.onUnauthorized]);

  async function saveBatch(batch, owner) {
    if (!owner.isCurrent()) return discardExpired();
    if (!batch.size) return;
    for (const [id, patch] of batch) {
      const gearOnly = !!patch.gear && Object.keys(patch).length === 1;
      if (!gearOnly) outcome.current.progress = true;
      try {
        const saved = await apiRequest(
          gearOnly ? "character.gear" : "character.quickSave",
          { id, ...patch },
        );
        if (!owner.isCurrent()) return discardExpired();
        revision.current++;
        setData(
          (state) =>
            state && {
              ...state,
              characters: state.characters.map((c) =>
                c.id === id && c.ownerId === state.me.id
                  ? { ...c, ...saved }
                  : c,
              ),
            },
        );
        batch.delete(id);
        publish();
      } catch (error) {
        if (!owner.isCurrent()) return discardExpired();
        if (error.status === 401) {
          owner.onUnauthorized();
          discardExpired();
          notify("登入已失效，請重新登入後儲存角色資料", "error");
          return;
        }
        // An incomplete HTTP response can still represent a committed write.
        if (!error.status || error.status >= 500)
          outcome.current.reconcile = true;
        batch.delete(id);
        const latest = publish()[id] || {};
        const failedFields = new Set();
        for (const [field, edits] of Object.entries(patch)) {
          for (const key of Object.keys(edits)) {
            if (Object.hasOwn(latest[field] || {}, key)) continue;
            if (field === "gear")
              failedFields.add(gearSlots.find((s) => s.id === key).label);
            else failedFields.add(field === "runs" ? "副本場次" : "自訂數量");
          }
        }
        if (failedFields.size) {
          outcome.current.failed = true;
          notify(
            `${gearOnly ? "裝備" : "角色資料"}儲存失敗（${[...failedFields].join("、")}） · ${error.message || "連線失敗"}`,
            "error",
          );
        }
      }
    }
    batches.current.delete(batch);
    if (batches.current.size) return;
    if (drafts.current.size) {
      flush();
      return;
    }
    const { failed, progress, reconcile } = outcome.current;
    outcome.current = {};
    if (!failed) notify(progress ? "角色資料已更新" : "裝備階級已更新");
    if (reconcile) refreshShell.current?.();
  }

  function flush() {
    discardExpired();
    clearTimeout(timer.current);
    timer.current = null;
    if (drafts.current.size) {
      const batch = drafts.current;
      const owner = draftSession.current;
      drafts.current = new Map();
      draftSession.current = null;
      batches.current.set(batch, owner);
      lastSave.current = enqueueWrite(() => saveBatch(batch, owner));
    }
    return lastSave.current;
  }

  function change(id, field, key, value) {
    if (!session.isCurrent()) return;
    discardExpired();
    draftSession.current = session;
    revision.current++;
    drafts.current.set(
      id,
      mergeChanges(drafts.current.get(id), { [field]: { [key]: value } }),
    );
    publish();
    if (batches.current.size) return;
    // Save after a short pause, or within 900 ms if selections keep arriving.
    const now = performance.now();
    if (timer.current === null) batchStarted.current = now;
    clearTimeout(timer.current);
    timer.current = setTimeout(
      flush,
      Math.min(300, Math.max(0, 900 - (now - batchStarted.current))),
    );
  }

  return { pending, change, flush, hasPending };
}
