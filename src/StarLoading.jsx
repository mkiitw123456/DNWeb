export default function StarLoading({
  message = "正在恢復登入，準備今天的小冒險…",
  overlay = false,
}) {
  return (
    <div
      className={`session-loading star-loading${overlay ? " star-loading-overlay" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <div className="star-stage" aria-hidden="true">
        <div className="star-energy" />
        <img
          src="/ddstar-logo-blue-v2.png"
          alt=""
          width="220"
          height="220"
          fetchPriority="high"
        />
      </div>
    </div>
  );
}
