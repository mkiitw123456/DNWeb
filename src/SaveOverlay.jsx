import { useEffect, useRef, useState } from "react";

export default function SaveOverlay() {
  const [state, setState] = useState(null);
  const indicator = useRef(null);
  useEffect(() => {
    const active = new Set();
    let failure = "";
    const warnBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = true;
    };
    const receive = ({ detail }) => {
      if (detail.state === "pending") {
        if (!active.size) failure = "";
        active.add(detail.id);
      } else {
        active.delete(detail.id);
        if (detail.state === "error")
          failure = detail.message || "請稍後再試。";
      }
      if (active.size) window.addEventListener("beforeunload", warnBeforeUnload);
      else window.removeEventListener("beforeunload", warnBeforeUnload);
      setState({
        kind: active.size ? "pending" : failure ? "error" : "success",
        message: failure,
        id: detail.id,
      });
    };
    window.addEventListener("ddstar-save", receive);
    return () => {
      window.removeEventListener("ddstar-save", receive);
      window.removeEventListener("beforeunload", warnBeforeUnload);
    };
  }, []);
  useEffect(() => {
    if (!state) return;
    indicator.current?.showPopover?.();
    if (state.kind === "pending") return;
    const timer = setTimeout(
      () => setState(null),
      state.kind === "error" ? 3500 : 1400,
    );
    return () => clearTimeout(timer);
  }, [state]);
  if (!state) return null;
  return (
    <aside
      ref={indicator}
      popover="manual"
      className={`save-overlay save-${state.kind}`}
      aria-label="儲存狀態"
    >
      <div
        role={state.kind === "error" ? "alert" : "status"}
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="save-spinner" aria-hidden="true" />
        <strong>
          {state.kind === "pending"
            ? "儲存中..."
            : state.kind === "success"
              ? "儲存成功"
              : "儲存失敗"}
        </strong>
        {state.kind === "error" && <p>{state.message}</p>}
      </div>
    </aside>
  );
}
