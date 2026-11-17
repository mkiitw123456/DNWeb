import { useEffect, useRef, useState } from "react";

export default function SaveOverlay() {
  const [state, setState] = useState(null);
  const dialog = useRef(null);
  const previousFocus = useRef(null);
  useEffect(() => {
    const active = new Set();
    let failure = "";
    const receive = ({ detail }) => {
      if (detail.state === "pending") {
        if (!active.size) failure = "";
        active.add(detail.id);
      } else {
        active.delete(detail.id);
        if (detail.state === "error")
          failure = detail.message || "請稍後再試。";
      }
      setState({
        kind: active.size ? "pending" : failure ? "error" : "success",
        message: failure,
        id: detail.id,
      });
    };
    window.addEventListener("ddstar-save", receive);
    return () => window.removeEventListener("ddstar-save", receive);
  }, []);
  useEffect(() => {
    if (!state) return;
    if (!dialog.current.open) {
      previousFocus.current = document.activeElement;
      dialog.current.showModal();
    }
    if (state.kind === "pending") return;
    const timer = setTimeout(
      () => setState(null),
      state.kind === "error" ? 3500 : 1400,
    );
    return () => clearTimeout(timer);
  }, [state]);
  useEffect(() => {
    if (!state && previousFocus.current?.isConnected) {
      previousFocus.current.focus();
      previousFocus.current = null;
    }
  }, [state]);
  if (!state) return null;
  return (
    <dialog
      ref={dialog}
      className={`save-overlay save-${state.kind}`}
      aria-label="儲存狀態"
      onCancel={(event) => {
        event.preventDefault();
        if (state.kind !== "pending") setState(null);
      }}
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
      {state.kind !== "pending" && (
        <button type="button" onClick={() => setState(null)}>
          關閉
        </button>
      )}
    </dialog>
  );
}
