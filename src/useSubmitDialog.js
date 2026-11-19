import { useRef, useState } from "react";

// Dismiss a submitted dialog immediately. A rejected request can restore its
// original input, but must never close or replace a later dialog.
export default function useSubmitDialog() {
  const [draft, setDraft] = useState(null);
  const session = useRef(0);
  function open(value) {
    session.current++;
    setDraft(value);
  }
  function close() {
    open(null);
  }
  async function submit(commit) {
    if (!draft) return;
    const current = ++session.current;
    setDraft(null);
    if (!(await commit(draft)) && session.current === current) setDraft(draft);
  }
  return { draft, setDraft, open, close, submit };
}
