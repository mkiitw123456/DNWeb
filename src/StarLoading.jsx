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
        <div className="star-halo" />
        <div className="star-orbit star-orbit-one">
          <i />
        </div>
        <div className="star-orbit star-orbit-two">
          <i />
        </div>
        <img src="/ddstar-logo-blue-v2.png" alt="" width="180" height="180" />
        <span className="star-spark spark-one">✦</span>
        <span className="star-spark spark-two">✧</span>
        <span className="star-spark spark-three">✦</span>
      </div>
      <strong className="star-wordmark">DDStar</strong>
      <p>{message}</p>
      <div className="star-loading-track" aria-hidden="true">
        <span />
      </div>
    </div>
  );
}
