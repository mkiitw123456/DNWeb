import { useEffect, useRef, useState } from "react";
import {
  applyActivityPatch,
  diffActivityConfig,
  mergeActivityConflict,
  rebaseActivityDraft,
} from "../shared/activity-config-patch.js";
import { notify } from "./FeedbackHost.jsx";

export default function useActivityConfigEditor(
  config,
  request,
  onCommit,
  onUnauthorized,
) {
  const confirmed = useRef(config);
  const writing = useRef(false);
  const queued = useRef(null);
  const [draft, setDraft] = useState(config);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const latestDraft = useRef(draft);
  latestDraft.current = draft;

  useEffect(() => {
    if (
      !config ||
      writing.current ||
      (confirmed.current && config.version <= confirmed.current.version)
    )
      return;
    // Refresh a clean editor. Retain an unsaved draft and its original version,
    // so concurrent admin edits still get conflict detection at the server.
    if (draft !== confirmed.current) return;
    confirmed.current = config;
    setDraft(config);
  }, [config, draft, saving]);

  async function save() {
    if (conflict) return;
    queued.current = draft;
    if (writing.current) return;
    writing.current = true;
    setSaving(true);
    setError("");
    try {
      while (queued.current) {
        const submitted = queued.current;
        queued.current = null;
        const base = confirmed.current;
        const categories = [
          ...new Set(submitted.questions.map((q) => q.category)),
        ];
        const patch = diffActivityConfig(base, {
          ...submitted,
          quizCategories: (submitted.quizCategories ?? categories).filter((c) =>
            categories.includes(c),
          ),
        });
        if (
          !Object.keys(patch.changes).length &&
          !Object.keys(patch.rows).length
        ) {
          setDraft((current) => rebaseActivityDraft(current, submitted, base));
          continue;
        }
        const result = await request("activity.config", {
          version: base.version,
          patch,
        });
        const next = {
          ...applyActivityPatch(base, result.patch),
          version: result.version,
          scripts: result.scripts ?? base.scripts,
        };
        confirmed.current = next;
        if (queued.current)
          queued.current = rebaseActivityDraft(queued.current, submitted, next);
        setDraft((current) => rebaseActivityDraft(current, submitted, next));
        onCommit(next);
      }
      notify("活動設定已儲存");
    } catch (failure) {
      queued.current = null;
      setError(failure.message);
      setConflict(failure.status === 409);
      notify(failure.message, "error");
      if (failure.status === 401) onUnauthorized();
    } finally {
      writing.current = false;
      setSaving(false);
    }
  }
  async function reloadLatest(keepChanges) {
    if (writing.current) return;
    writing.current = true;
    setSaving(true);
    const initialDraft = latestDraft.current;
    try {
      const { adminConfig: fresh } = await request("activity.state");
      const current = latestDraft.current;
      const next = mergeActivityConflict(
        keepChanges ? confirmed.current : initialDraft,
        current,
        fresh,
      );
      confirmed.current = fresh;
      setDraft(next);
      onCommit(fresh);
      setConflict(false);
      setError("");
    } catch (failure) {
      setError(failure.message);
      if (failure.status === 401) onUnauthorized();
    } finally {
      writing.current = false;
      setSaving(false);
    }
  }
  return {
    draft,
    setDraft,
    save,
    saving,
    error,
    conflict,
    reloadLatest,
    dirty: draft !== confirmed.current,
  };
}
