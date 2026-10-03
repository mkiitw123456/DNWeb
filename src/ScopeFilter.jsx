export default function ScopeFilter({ value, onChange }) {
  return (
    <div className="scope-filter" role="group" aria-label="顯示範圍">
      <button
        aria-pressed={value === "mine"}
        className={value === "mine" ? "active" : ""}
        onClick={() => onChange("mine")}
      >
        與我有關
      </button>
      <button
        aria-pressed={value === "all"}
        className={value === "all" ? "active" : ""}
        onClick={() => onChange("all")}
      >
        所有人
      </button>
    </div>
  );
}
