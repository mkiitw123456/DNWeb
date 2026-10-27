import { SquarePen, Heart, Swords } from "lucide-react";
import ProfessionIcon from "./ProfessionIcon.jsx";
import { Button, money } from "./ui.jsx";
export default function CharacterCard({
  character: c,
  professions,
  dungeons,
  quantityTypes,
  canEdit,
  busy,
  mutate,
  onEdit,
}) {
  const profession = professions.find((p) => p.id === c.professionId);
  return (
    <article className="compact-character" aria-label={`角色 ${c.name}`}>
      <header className="compact-character-header">
        <h3 title={c.name}>{c.name}</h3>
        <ProfessionIcon profession={profession} />
        {canEdit && (
          <Button aria-label={`編輯角色 ${c.name}`} onClick={onEdit}>
            <SquarePen size={14} />
          </Button>
        )}
      </header>
      <div className="compact-stats">
        {[
          [Heart, "血量", c.hp],
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
      <div
        className={
          dungeons.length > 3
            ? "compact-dungeons many-dungeons"
            : "compact-dungeons"
        }
      >
        {dungeons.map((d) => (
          <div key={d.id} className="compact-run">
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
              {canEdit && (
                <Button
                  aria-label={`${c.name} ${d.name} 全部完成`}
                  disabled={busy || (c.runs[d.id] || 0) >= d.max}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() =>
                    mutate(
                      "character.complete",
                      { id: c.id, dungeonId: d.id },
                      "此關卡已全部完成",
                    )
                  }
                >
                  {(c.runs[d.id] || 0) >= d.max ? "已完成" : "全完成"}
                </Button>
              )}
            </div>
          </div>
        ))}
        {!dungeons.length && <small>尚未設定副本</small>}
      </div>
      {quantityTypes.length > 0 && (
        <div className="compact-dungeons" aria-label="自訂數量">
          {quantityTypes.map((t) => (
            <div className="compact-run" key={t.id}>
              <span title={t.name}>{t.name}</span>
              <input
                key={`${c.id}-${t.id}-${c.quantities?.[t.id] || 0}`}
                aria-label={`${c.name} ${t.name} 數量`}
                type="number"
                min="0"
                max="1000000000000"
                step="1"
                defaultValue={c.quantities?.[t.id] || 0}
                readOnly={!canEdit}
                disabled={busy}
                onBlur={(e) => {
                  if (!canEdit) return;
                  const quantity = Number(e.target.value);
                  if (
                    e.target.value !== "" &&
                    e.target.validity.valid &&
                    quantity !== (c.quantities?.[t.id] || 0)
                  )
                    mutate("character.quantity", {
                      id: c.id,
                      typeId: t.id,
                      quantity,
                    });
                  else e.target.value = c.quantities?.[t.id] || 0;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
              />
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
