import { useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, X } from "lucide-react";
const eventName = "ddstar-notice";
export function notify(message, kind = "success") {
  if (message)
    window.dispatchEvent(
      new CustomEvent(eventName, {
        detail: { message, kind, id: crypto.randomUUID() },
      }),
    );
}
export function useFeedback(error, success) {
  useEffect(() => {
    if (error) notify(error, "error");
  }, [error]);
  useEffect(() => {
    if (success) notify(success);
  }, [success]);
}
export default function FeedbackHost() {
  const [notice, setNotice] = useState(null),
    [leaving, setLeaving] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const receive = (e) => {
      setLeaving(false);
      setNotice(e.detail);
    };
    let invalidBatch = false,
      invalidTimer;
    const invalid = (e) => {
      e.preventDefault();
      if (invalidBatch) return;
      invalidBatch = true;
      invalidTimer = setTimeout(() => {
        invalidBatch = false;
      });
      const el = e.target,
        label =
          el.getAttribute("aria-label") ||
          el.labels?.[0]?.querySelector("span")?.textContent ||
          el.name ||
          "欄位";
      notify(
        el.validity.valueMissing
          ? `請填寫「${label}」`
          : `請檢查「${label}」：${el.validationMessage}`,
        "error",
      );
      el.closest("details")?.setAttribute("open", "");
      el.focus();
    };
    window.addEventListener(eventName, receive);
    document.addEventListener("invalid", invalid, true);
    return () => {
      window.removeEventListener(eventName, receive);
      document.removeEventListener("invalid", invalid, true);
      clearTimeout(invalidTimer);
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    ref.current?.showPopover?.();
    const exit = setTimeout(() => setLeaving(true), 2800),
      end = setTimeout(() => setNotice(null), 3000);
    return () => {
      clearTimeout(exit);
      clearTimeout(end);
    };
  }, [notice]);
  if (!notice) return null;
  const Icon = notice.kind === "error" ? CircleAlert : CheckCircle2;
  return (
    <div
      key={notice.id}
      ref={ref}
      popover="manual"
      className={`feedback-banner ${notice.kind}${leaving ? " leaving" : ""}`}
      role={notice.kind === "error" ? "alert" : "status"}
      aria-atomic="true"
    >
      <Icon size={21} />
      <span>{notice.message}</span>
      <button
        type="button"
        aria-label="關閉提示"
        onClick={() => setNotice(null)}
      >
        <X size={17} />
      </button>
    </div>
  );
}
