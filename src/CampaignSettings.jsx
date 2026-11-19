import { CalendarDays } from "lucide-react";
import { Button, Field } from "./ui.jsx";

export default function CampaignSettings({
  scripts,
  schedule,
  onChange,
  save,
  busy,
}) {
  const today = new Date(Date.now() - 3600000).toISOString().slice(0, 10);
  const currentDay = schedule
    .map((entry) => entry.startDay)
    .filter((day) => day && day <= today)
    .sort()
    .at(-1);
  function add() {
    let day = today;
    while (schedule.some((entry) => entry.startDay === day)) {
      day = new Date(Date.parse(day) + 86400000).toISOString().slice(0, 10);
    }
    onChange([...schedule, { startDay: day, scriptId: scripts[0].id }]);
  }
  function edit(i, changes) {
    onChange(
      schedule.map((entry, n) => (n === i ? { ...entry, ...changes } : entry)),
    );
  }
  return (
    <section className="activity-admin">
      <div className="lobby-section-title">
        <h2>正式劇本</h2>
        <Button primary disabled={busy} onClick={save}>
          儲存檔期
        </Button>
      </div>
      <p className="muted">
        劇本在開始日的台灣時間 09:00
        開放。每位成員從第一話出發，每天最多推進三話，機遇挑戰另計。下一個檔期開始時切換劇本。
      </p>
      {!schedule.length && (
        <p>尚未安排正式劇本，目前依冒險事件題庫與日曆開放遊玩。</p>
      )}
      {schedule.map((entry, i) => {
        const script = scripts.find((s) => s.id === entry.scriptId);
        return (
          <fieldset key={i} className="activity-rule" disabled={busy}>
            <legend>
              {entry.startDay === currentDay
                ? "本期劇本"
                : entry.startDay > today
                  ? "即將開放"
                  : "過往檔期"}
            </legend>
            <div className="form-grid two">
              <Field
                type="date"
                label="開始日（台灣時間）"
                value={entry.startDay}
                onChange={(e) => edit(i, { startDay: e.target.value })}
              />
              <Field label="開放劇本">
                <select
                  value={entry.scriptId}
                  onChange={(e) => edit(i, { scriptId: e.target.value })}
                >
                  {scripts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}（{s.chapters} 話）
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="lobby-section-title">
              <p>{script?.description}</p>
              <Button
                onClick={() => onChange(schedule.filter((_, n) => n !== i))}
              >
                移除檔期
              </Button>
            </div>
          </fieldset>
        );
      })}
      <div className="actions">
        <Button
          disabled={busy || !scripts.length || schedule.length >= 100}
          onClick={add}
        >
          <CalendarDays size={15} /> 新增檔期
        </Button>
      </div>
    </section>
  );
}
