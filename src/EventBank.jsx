import { useState } from "react";
import { Button, Field, NumberField } from "./ui.jsx";
import { matchesContent } from "./activity-calendar.js";

const newOption = (chance = 50, high = 3, low = 1) => ({
  text: "",
  outcomes: [
    { result: "", chance, stars: high },
    { result: "", chance: 100 - chance, stars: low },
  ],
});
function newEvent(example) {
  return {
    id: crypto.randomUUID(),
    title: example ? "眼前的兩瓶藥水" : "",
    story: example ? "桌上放著兩瓶藥水。你決定喝哪一瓶？" : "",
    options: example
      ? [
          {
            text: "喝左邊的藥水",
            outcomes: [
              { result: "回復血量", chance: 50, stars: 3 },
              { result: "扣血", chance: 50, stars: 1 },
            ],
          },
          {
            text: "喝右邊的藥水",
            outcomes: [
              { result: "回復血量", chance: 20, stars: 7 },
              { result: "扣血", chance: 80, stars: -1 },
            ],
          },
        ]
      : [newOption(), newOption(30, 5, -1)],
  };
}
const replaceAt = (items, index, value) =>
  items.map((item, i) => (i === index ? value : item));
const removeAt = (items, index) => items.filter((_, i) => i !== index);

export default function EventBank({
  events,
  onChange,
  busy,
  save,
  unlimited,
  onUnlimited,
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(null);
  function add(example) {
    const event = newEvent(example);
    onChange([...events, event]);
    setQuery("");
    setOpen(event.id);
  }
  return (
    <section className="activity-admin">
      <div className="lobby-section-title">
        <h2>冒險事件題庫</h2>
        <Button primary disabled={busy} onClick={save}>
          儲存題庫
        </Button>
      </div>
      <label className="switch-row">
        冒險連玩測試（解除每日次數限制）
        <input
          type="checkbox"
          checked={unlimited}
          disabled={busy}
          onChange={(e) => onUnlimited(e.target.checked)}
        />
      </label>
      <p className="muted">
        每天首次冒險優先使用日曆指定的事件，其餘回合接續個人旅程。星數照常結算。
      </p>
      <Field
        label="搜尋事件"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="actions">
        <Button
          disabled={busy || events.length >= 160}
          onClick={() => add(false)}
        >
          新增事件
        </Button>
        <Button
          disabled={busy || events.length >= 160}
          onClick={() => add(true)}
        >
          新增藥水範例
        </Button>
      </div>
      {events.map((event, i) => {
        if (!matchesContent([event.title, event.story].join(" "), query))
          return null;
        const edit = (changes) =>
          onChange(replaceAt(events, i, { ...event, ...changes }));
        return (
          <section key={event.id} className="activity-rule">
            <button
              aria-expanded={open === event.id}
              onClick={() => setOpen(open === event.id ? null : event.id)}
            >
              {event.title || "未命名事件"}
            </button>
            {open === event.id && (
              <fieldset disabled={busy}>
                <Field
                  label="事件標題"
                  value={event.title}
                  onChange={(e) => edit({ title: e.target.value })}
                />
                <Field label="情境內文">
                  <textarea
                    value={event.story}
                    onChange={(e) => edit({ story: e.target.value })}
                  />
                </Field>
                {event.options.map((opt, j) => {
                  const change = (fields) =>
                    edit({
                      options: replaceAt(event.options, j, {
                        ...opt,
                        ...fields,
                      }),
                    });
                  return (
                    <fieldset key={j}>
                      <legend>
                        {opt.revealChance !== undefined
                          ? "機遇選項"
                          : `選項 ${j + 1}`}
                      </legend>
                      {opt.revealChance !== undefined && (
                        <NumberField
                          label="出現機率（%）"
                          max={100}
                          value={opt.revealChance}
                          onChange={(e) =>
                            change({ revealChance: Number(e.target.value) })
                          }
                        />
                      )}
                      <Field
                        label="選項名稱"
                        value={opt.text}
                        onChange={(e) => change({ text: e.target.value })}
                      />
                      {opt.outcomes.map((o, k) => {
                        const update = (fields) =>
                          change({
                            outcomes: replaceAt(opt.outcomes, k, {
                              ...o,
                              ...fields,
                            }),
                          });
                        return (
                          <div className="activity-rule" key={k}>
                            <Field
                              label="結果文字"
                              value={o.result}
                              onChange={(e) =>
                                update({ result: e.target.value })
                              }
                            />
                            <div className="form-grid">
                              <NumberField
                                label="發生機率（%）"
                                min={1}
                                max={100}
                                value={o.chance}
                                onChange={(e) =>
                                  update({
                                    chance:
                                      e.target.value === ""
                                        ? ""
                                        : Number(e.target.value),
                                  })
                                }
                              />
                              <NumberField
                                label="星星增減"
                                min={-100}
                                max={100}
                                value={o.stars}
                                onChange={(e) =>
                                  update({
                                    stars:
                                      e.target.value === ""
                                        ? ""
                                        : Number(e.target.value),
                                  })
                                }
                              />
                            </div>
                            <Button
                              disabled={opt.outcomes.length <= 1}
                              onClick={() =>
                                change({ outcomes: removeAt(opt.outcomes, k) })
                              }
                            >
                              刪除結果
                            </Button>
                          </div>
                        );
                      })}
                      <p>
                        機率合計{" "}
                        {opt.outcomes.reduce(
                          (sum, o) => sum + Number(o.chance),
                          0,
                        )}{" "}
                        / 100%
                      </p>
                      <Button
                        disabled={opt.outcomes.length >= 8}
                        onClick={() =>
                          change({
                            outcomes: [
                              ...opt.outcomes,
                              { result: "", chance: 1, stars: 0 },
                            ],
                          })
                        }
                      >
                        新增結果
                      </Button>
                      <Button
                        disabled={
                          opt.revealChance === undefined &&
                          event.options.filter(
                            (o) => o.revealChance === undefined,
                          ).length <= 2
                        }
                        onClick={() =>
                          edit({ options: removeAt(event.options, j) })
                        }
                      >
                        刪除選項
                      </Button>
                    </fieldset>
                  );
                })}
                <Button
                  disabled={event.options.length >= 6}
                  onClick={() =>
                    edit({ options: [...event.options, newOption()] })
                  }
                >
                  新增選項
                </Button>
                <Button
                  disabled={
                    event.options.length >= 6 ||
                    event.options.some((o) => o.revealChance !== undefined)
                  }
                  onClick={() =>
                    edit({
                      options: [
                        ...event.options,
                        { ...newOption(20, 12, -2), revealChance: 30 },
                      ],
                    })
                  }
                >
                  新增機遇選項
                </Button>
                <Button
                  disabled={events.length <= 1}
                  onClick={() => onChange(removeAt(events, i))}
                >
                  刪除事件
                </Button>
              </fieldset>
            )}
          </section>
        );
      })}
    </section>
  );
}
