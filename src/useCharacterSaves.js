import { applyCharacterPatch } from "./guildPatches.js";
import { useEffect, useRef, useState } from "react";
import { apiRequest } from "./api.js";
import { notify } from "./FeedbackHost.jsx";


// Store one submitted field per key so independent tabs cannot erase other fields.
const namespace = (member) => "ddstar.character-draft.v1/" + encodeURIComponent(member) + "/";
const fieldKey = (member, id, field, key) =>
  namespace(member) + [id, field, key].map(encodeURIComponent).join("/");
function localDrafts(action) {
  try {
    return action(localStorage);
  } catch {
    notify("瀏覽器無法存取本機草稿，請在關閉前完成同步", "error");
  }
}

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
  const receipts = useRef(new WeakMap());
  const failures = useRef(new Map());
  const [failed, setFailed] = useState({});
  const saving = Object.keys(pending).length > 0 || Object.keys(failed).length > 0;

  function publishFailures() {
    setFailed(Object.fromEntries([...failures.current].map(([id, item]) => [id, item.patch])));
  }
  function forget(id) {
    if (session.memberId) localDrafts(store => {
      const prefix = namespace(session.memberId) + encodeURIComponent(id) + "/";
      for (const k of Object.keys(store)) if (k.startsWith(prefix)) store.removeItem(k);
    });
    if (failures.current.delete(id)) publishFailures();
  }
  function clearField(id, field, key, clearLocal = true) {
    if (clearLocal && session.memberId) localDrafts(store => store.removeItem(fieldKey(session.memberId, id, field, key)));
    const item = failures.current.get(id);
    if (!item || !Object.hasOwn(item.patch[field] || {}, key)) return;
    const edits = { ...item.patch[field] };
    delete edits[key];
    const patch = { ...item.patch, [field]: edits };
    if (!Object.keys(edits).length) delete patch[field];
    if (Object.keys(patch).length) failures.current.set(id, { ...item, patch });
    else failures.current.delete(id);
    publishFailures();
  }

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
    for (const [id, item] of failures.current) {
      if (!item.owner.isCurrent()) { failures.current.delete(id); publishFailures(); }
    }
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

  useEffect(() => {
    if (!session.memberId) return;
    const prefix = namespace(session.memberId);
    localDrafts(store => {
      for (const k of Object.keys(store)) {
        if (!k.startsWith(prefix)) continue;
        try {
          const [id, field, key] = k.slice(prefix.length).split("/").map(decodeURIComponent);
          if (!id || !key || !["details", "gear", "quantities", "runs"].includes(field)) continue;
          const { value } = JSON.parse(store.getItem(k));
          if (typeof value !== "number" && typeof value !== "string") continue;
          const patch = mergeChanges(failures.current.get(id)?.patch, { [field]: { [key]: value } });
          failures.current.set(id, { owner: session, patch });
        } catch { /* Ignore damaged individual entries. */ }
      }
    });
    publishFailures();
  }, [session.memberId, session.onUnauthorized]);

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
        localDrafts(store => {
          for (const [k, receipt] of receipts.current.get(patch) || [])
            if (store.getItem(k) === receipt) store.removeItem(k);
        });
        revision.current++;
        setData(state => {
          const own = state?.characters.find(c => c.id === id && c.ownerId === state.me.id);
          return own ? applyCharacterPatch(state, {...own,...saved}) : state;
        });
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
        let retained = {};
        for (const [field, edits] of Object.entries(patch)) {
          for (const [key, value] of Object.entries(edits)) {
            if (!Object.hasOwn(latest[field] || {}, key))
              retained = mergeChanges(retained, { [field]: { [key]: value } });
          }
        }
        if (Object.keys(retained).length) {
          failures.current.set(id, { owner, patch: mergeChanges(failures.current.get(id)?.patch, retained) });
          publishFailures();
          outcome.current.failed = true;
          notify("角色資料同步失敗，已保留輸入。" + (error.message || ""), "error");
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
    clearField(id, field, key, false);
    draftSession.current = session;
    revision.current++;
    const previous = drafts.current.get(id);
    const patch = mergeChanges(previous, { [field]: { [key]: value } });
    const k = fieldKey(session.memberId, id, field, key);
    const receipt = JSON.stringify({ value, token: crypto.randomUUID() });
    localDrafts(store => store.setItem(k, receipt));
    const keys = new Map(receipts.current.get(previous));
    keys.set(k, receipt);
    receipts.current.set(patch, keys);
    drafts.current.set(id, patch);
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

  function retry(id, field, key) {
    const item = failures.current.get(id);
    if (!item?.owner.isCurrent() || !Object.hasOwn(item.patch[field] || {}, key)) return;
    change(id, field, key, item.patch[field][key]);
    flush();
  }

  return { pending, failed, change, retry, forget, clearField, flush, hasPending };
}
