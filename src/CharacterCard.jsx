import { SquarePen, Heart, Zap, Swords } from "lucide-react";
import { Button, money } from "./ui.jsx";
export default function CharacterCard({
  character: c,
  professions,
  dungeons,
  canEdit,
  busy,
  mutate,
  onEdit,
}) {
  const profession = professions.find((p) => p.id === c.professionId);
  return (
    <article
      className="compact-character"
      style={{ "--profession-color": profession?.color || "#435568" }}
      aria-label={`角色 ${c.name}`}
    >
      <header className="compact-character-header">
        <h3 title={c.name}>{c.name}</h3>
        <span className="profession-label">
          <i style={{ background: profession?.color || "#65758a" }} />
          {profession?.name || "未設定職業"}
        </span>
        {canEdit && (
          <Button aria-label={`編輯角色 ${c.name}`} onClick={onEdit}>
            <SquarePen size={14} />
          </Button>
        )}
      </header>
      <div className="compact-stats">
        {[
          [Heart, "血量", c.hp],
          [Zap, "疲勞", c.fatigue],
          [Swords, "攻擊", c.attack],
        ].map(([Icon, label, value]) => (
          <div key={label}>
            <span>
              <Icon size={13} />
              {label}
            </span>
            <strong title={String(value)}>{money(value)}</strong>
          </div>
        ))}
      </div>
      <div className="compact-dungeons">
        {dungeons.map((d) => (
          <label key={d.id} className="compact-run">
            <span title={d.name}>{d.name}</span>
            <div>
              <input
                key={`${c.id}-${d.id}-${c.runs[d.id] || 0}`}
                aria-label={`${c.name} ${d.name} 次數`}
                type="number"
                min="0"
                max={d.max}
                step="1"
                defaultValue={c.runs[d.id] || 0}
                readOnly={!canEdit}
                disabled={busy}
                onBlur={(e) => {
                  if (!canEdit) return;
                  const n = Number(e.target.value);
                  if (
                    e.target.value !== "" &&
                    e.target.validity.valid &&
                    n !== (c.runs[d.id] || 0)
                  )
                    mutate("character.run", {
                      id: c.id,
                      dungeonId: d.id,
                      count: n,
                    });
                  else e.target.value = c.runs[d.id] || 0;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
              />
              <small>/ {d.max}</small>
            </div>
          </label>
        ))}
        {!dungeons.length && <small>尚未設定副本</small>}
      </div>
    </article>
  );
}
