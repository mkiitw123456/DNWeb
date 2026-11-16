import { useEffect, useRef, useState } from "react";
import { Button } from "./ui.jsx";
const steps = [
  {
    page: "lobby",
    target: "#daily-activities .activity-card",
    title: "每日活動",
    text: "從這裡參加小冒險。卡片會顯示今天的次數與可獲得積分。",
  },
  {
    page: "lobby",
    target: '[data-tour="stats"]',
    title: "查看自己的積分",
    text: "本週積分每週一換週，累積積分與參與次數會保留。點遊戲暱稱可以修改顯示名稱。",
  },
  {
    page: "lobby",
    target: '[data-tour="lobby-tabs"]',
    title: "我的冒險",
    text: "切到「我的冒險」可以查看參與摘要，不會載入一長串歷史紀錄。",
  },
  {
    page: "characters",
    target: ".heading",
    title: "角色與副本進度",
    text: "在角色資訊新增角色，之後可記錄戰力、數量與每週副本次數。",
  },
  {
    page: "lobby",
    target: '[data-tour="preferences"]',
    title: "調成自己喜歡的樣子",
    text: "外觀設定可以調整背景、按鈕、外框與漸層，配色只保存在這台瀏覽器。也可隨時重看這份導覽。",
  },
];
export default function GuidedTour({ setPage, onFinish, busy }) {
  const [step, setStep] = useState(0),
    [rect, setRect] = useState(null);
  const dialog = useRef(null),
    panel = useRef(null);
  const item = steps[step];
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    setPage(item.page);
    setRect(null);
    let disposed = false,
      frame,
      attempt = 0;
    const locate = () => {
      const element = document.querySelector(item.target);
      if (!element && attempt++ < 90) {
        frame = requestAnimationFrame(locate);
        return;
      }
      if (!element) return;
      const r = element.getBoundingClientRect();
      if (r.top < 0 || r.bottom > innerHeight)
        element.scrollIntoView({ block: "center", behavior: "instant" });
      if (!disposed) setRect(element.getBoundingClientRect());
    };
    frame = requestAnimationFrame(locate);
    const update = () => {
      const e = document.querySelector(item.target);
      if (e) setRect(e.getBoundingClientRect());
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [item, setPage]);
  const width = Math.min(340, innerWidth - 32),
    height = 240;
  const left = rect
    ? Math.max(16, Math.min(rect.left, innerWidth - width - 16))
    : 16;
  const top = rect
    ? Math.max(
        16,
        Math.min(
          rect.bottom + 16 + height < innerHeight
            ? rect.bottom + 16
            : rect.top - height - 16,
          innerHeight - height - 16,
        ),
      )
    : Math.max(16, (innerHeight - height) / 2);
  return (
    <dialog
      ref={dialog}
      className="tour-dialog"
      aria-labelledby="tour-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onFinish();
      }}
    >
      <div className="tour-shade" />
      {rect && (
        <div
          className="tour-highlight"
          aria-hidden="true"
          style={{
            left: Math.max(4, rect.left - 5),
            top: Math.max(4, rect.top - 5),
            width: Math.min(rect.width + 10, innerWidth - 8),
            height: Math.min(rect.height + 10, innerHeight - 8),
          }}
        />
      )}
      <section className="tour-panel" ref={panel} style={{ left, top, width }}>
        <small>
          {step + 1} / {steps.length}
        </small>
        <h2 id="tour-title">{item.title}</h2>
        <p>{item.text}</p>
        <div className="form-actions">
          <Button disabled={busy} onClick={onFinish}>
            略過導覽
          </Button>
          {step > 0 && (
            <Button disabled={busy} onClick={() => setStep((s) => s - 1)}>
              上一步
            </Button>
          )}
          <Button
            primary
            disabled={busy}
            onClick={() =>
              step === steps.length - 1 ? onFinish() : setStep((s) => s + 1)
            }
          >
            {step === steps.length - 1 ? "開始使用" : "下一步"}
          </Button>
        </div>
      </section>
    </dialog>
  );
}
