import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Save } from "lucide-react";
import { Button, Field } from "./ui.jsx";
import { matchesContent, monthCells, shiftMonth } from "./activity-calendar.js";
const kinds = [
  ["fortune", "每日冒險抽籤", "fortunes"],
  ["quiz", "龍谷快問快答", "questions"],
  ["event", "冒險隨機事件", "events"],
];
const titleOf = (x) => x.title || x.question;
export default function ActivityCalendar({ config, onChange, onSave }) {
  const today = new Date(Date.now() - 3600000).toISOString().slice(0, 10);
  const [day, setDay] = useState(today),
    [month, setMonth] = useState(today.slice(0, 7)),
    [queries, setQueries] = useState({});
  const schedule = config.schedule || {},
    chosen = schedule[day] || {};
  const select = (kind, id) => {
    const entry = { ...chosen };
    if (id) entry[kind] = id;
    else delete entry[kind];
    const next = { ...schedule };
    if (Object.keys(entry).length) next[day] = entry;
    else delete next[day];
    onChange(next);
  };
  return (
    <section className="activity-calendar">
      <div className="lobby-section-title">
        <h2>
          <CalendarDays size={20} /> 活動日曆
        </h2>
        <Button primary onClick={onSave}>
          <Save size={16} />
          儲存日曆
        </Button>
      </div>
      <p className="muted">
        每個活動日為台灣時間當日 09:00 至隔日
        09:00。指定內容對所有人生效，冒險事件在正式劇本檔期內會依玩家章節進度出題。修改安排會保留當日已完成次數。
      </p>
      <div className="calendar-toolbar">
        <Button
          aria-label="上一個月"

          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          <ChevronLeft size={18} />
        </Button>
        <Field
          label="日曆月份"
          type="month"
          value={month}
          onChange={(e) => {
            if (e.target.value) setMonth(e.target.value);
          }}
        />
        <Button
          aria-label="下一個月"

          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          <ChevronRight size={18} />
        </Button>
        <Button
          onClick={() => {
            setDay(today);
            setMonth(today.slice(0, 7));
            setQueries({});
          }}
        >
          目前活動日
        </Button>
      </div>
      <div className="calendar-grid" aria-label="活動日期">
        {["一", "二", "三", "四", "五", "六", "日"].map((w) => (
          <span className="calendar-weekday" key={w}>
            {w}
          </span>
        ))}
        {monthCells(month).map((date, i) =>
          date ? (
            <button
              type="button"
              key={date}

              className={`calendar-day${day === date ? " selected" : ""}`}
              aria-pressed={day === date}
              aria-label={`${date}，${Object.keys(schedule[date] || {}).length} 項指定活動`}
              onClick={() => {
                setDay(date);
                setQueries({});
              }}
            >
              <strong>{Number(date.slice(-2))}</strong>
              <small>
                {Object.keys(schedule[date] || {}).length
                  ? `${Object.keys(schedule[date]).length} 項指定`
                  : "隨機"}
              </small>
              {date === today && <span className="calendar-today">本日</span>}
            </button>
          ) : (
            <span key={`empty-${i}`} aria-hidden="true" />
          ),
        )}
      </div>
      <h3 className="calendar-selected-date">{day} 的活動安排</h3>
      <p className="muted">
        輸入任意一字或名稱片段即可搜尋，不分英文大小寫。切換日期會保留未儲存的選擇，完成後請按「儲存日曆」。
      </p>
      <div className="calendar-pickers">
        {kinds.map(([kind, label, pool]) => {
          const items = config[pool].filter((x) => x.id),
            selected = items.find((x) => x.id === chosen[kind]);
          const results = items.filter((x) =>
            matchesContent(titleOf(x), queries[kind]),
          );
          return (
            <section className="calendar-picker" key={kind} aria-label={label}>
              <h4>{label}</h4>
              <p className="calendar-choice">
                已選擇：
                <strong>
                  {selected
                    ? titleOf(selected)
                    : chosen[kind]
                      ? "內容已刪除，請重新選擇"
                      : "隨機出題"}
                </strong>
              </p>
              <Field
                label={`搜尋${label}`}
                placeholder="輸入名稱的一部分"
                value={queries[kind] || ""}
                onChange={(e) =>
                  setQueries({ ...queries, [kind]: e.target.value })
                }
              />
              <Button
                aria-pressed={!chosen[kind]}
                onClick={() => select(kind, null)}
              >
                不指定，使用隨機
              </Button>
              <div className="calendar-results">
                {results.map((x) => (
                  <button
                    type="button"
                    key={x.id}

                    aria-pressed={chosen[kind] === x.id}
                    onClick={() => select(kind, x.id)}
                  >
                    <strong>{titleOf(x)}</strong>
                    <small>{x.body || x.story || x.category}</small>
                  </button>
                ))}
                {!results.length && <p className="muted">找不到符合的內容。</p>}
              </div>
            </section>
          );
        })}
      </div>
      <div className="form-actions">
        <Button primary onClick={onSave}>
          儲存日曆
        </Button>
      </div>
    </section>
  );
}
