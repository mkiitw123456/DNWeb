import { useState } from "react";
import { SquarePen } from "lucide-react";
import GearPicker from "./GearPicker.jsx";
import ProfessionIcon from "./ProfessionIcon.jsx";
import { Button } from "./ui.jsx";
import { notify } from "./FeedbackHost.jsx";

function CountInput({ label, value, max, readOnly, disabled, onCommit }) {
  const [draft, setDraft] = useState(null);
  return (
    <input
      aria-label={label}
      type="number"
      min="0"
      max={max}
      step="1"
      value={draft ?? value}
      readOnly={readOnly}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        if (readOnly || draft === null) return;
        const field = e.currentTarget;
        if (field.validity.badInput || !field.validity.valid) {
          notify(`${label}須為 0 至 ${max} 的整數`, "error");
        } else if (field.value !== "" && field.valueAsNumber !== value) {
          onCommit(field.valueAsNumber);
        }
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

export default function CharacterCard({
  character: c,
  professions,
  dungeons,
  quantityTypes,
  canEdit,
  busy,
  pending,
  change,
  onEdit,
}) {
  const profession = professions.find((p) => p.id === c.professionId);
  return (
    <article className="compact-character" aria-label={`角色 ${c.name}`}>
      <header className="compact-character-header">
        <h3 title={c.name}>{c.name}</h3>
        {pending && (
          <small role="status" className="gear-saving">
            儲存中…
          </small>
        )}
        <ProfessionIcon profession={profession} />
        {canEdit && (
          <Button aria-label={`編輯角色 ${c.name}`} onClick={onEdit}>
            <SquarePen size={14} />
          </Button>
        )}
      </header>
      <GearPicker
        characterName={c.name}
        gear={{ ...c.gear, ...pending?.gear }}
        disabled={busy}
        onChange={
          canEdit
            ? (slot, grade) => change(c.id, "gear", slot, grade)
            : undefined
        }
      />
      <div
        className={
          dungeons.length > 3
            ? "compact-dungeons many-dungeons"
            : "compact-dungeons"
        }
      >
        {dungeons.map((d) => {
          const run = pending?.runs?.[d.id] ?? c.runs[d.id] ?? 0;
          const count = run === "complete" ? d.max : run;
          const done = count >= d.max;
          return (
            <div
              key={d.id}
              className={`compact-run ${done ? "completed-runs" : ""}`}
            >
              <span title={d.name}>{d.name}</span>
              <div>
                <CountInput
                  label={`${c.name} ${d.name} 次數`}
                  value={count}
                  max={d.max}
                  readOnly={!canEdit}
                  disabled={busy}
                  onCommit={(n) => change(c.id, "runs", d.id, n)}
                />
                <small>/ {d.max}</small>
                {canEdit && (
                  <Button
                    aria-label={`${c.name} ${d.name} 全部完成`}
                    disabled={busy || done}
                    onClick={() => change(c.id, "runs", d.id, "complete")}
                  >
                    {done ? "已完成" : "全完成"}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        {!dungeons.length && <small>尚未設定副本</small>}
      </div>
      {quantityTypes.length > 0 && (
        <div className="compact-dungeons" aria-label="自訂數量">
          {quantityTypes.map((t) => (
            <div className="compact-run" key={t.id}>
              <span title={t.name}>{t.name}</span>
              <CountInput
                label={`${c.name} ${t.name} 數量`}
                value={pending?.quantities?.[t.id] ?? c.quantities?.[t.id] ?? 0}
                max={1e12}
                readOnly={!canEdit}
                disabled={busy}
                onCommit={(quantity) =>
                  change(c.id, "quantities", t.id, quantity)
                }
              />
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
