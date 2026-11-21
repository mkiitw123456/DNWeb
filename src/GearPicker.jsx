import { ChevronDown, Gem, Shield, Sword } from "lucide-react";
import { gearGrades, gearSlots } from "../shared/gear.js";
import "./gear.css";

const icons = { equipment: Shield, weapon: Sword, accessory: Gem };

export default function GearPicker({
  gear,
  characterName,
  onChange,
  disabled,
  renderStatus,
}) {
  return (
    <div className="gear-picker" role="group" aria-label="裝備階級">
      {gearSlots.map(({ id, label }) => {
        const grade = gear?.[id];
        const Icon = icons[id];
        return (
          <div key={id} className="gear-slot-group"><div className="gear-slot" data-grade={grade || "none"}>
            <span className="gear-emblem" aria-hidden="true">
              <Icon size={25} strokeWidth={1.55} />
              {grade && <strong>{grade}</strong>}
            </span>
            <span className="gear-slot-caption">
              {label}
              {onChange && <ChevronDown size={12} aria-hidden="true" />}
            </span>
            {!grade && <small className="gear-empty">未設定</small>}
            {onChange ? (
              <select
                aria-label={`${characterName ? characterName + " " : ""}${label}階級`}
                title={`${label}階級：${grade || "未設定"}`}
                value={grade || ""}
                disabled={disabled}
                onChange={(e) => onChange(id, e.target.value || null)}
              >
                <option value="">未設定</option>
                {gearGrades.map((g) => (
                  <option key={g} value={g}>
                    {g} 級
                  </option>
                ))}
              </select>
            ) : (
              grade && <span className="gear-readonly-grade">{grade} 級</span>
            )}
          </div>{renderStatus?.(id)}</div>
        );
      })}
    </div>
  );
}
