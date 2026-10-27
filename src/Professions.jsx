import { useState } from "react";
import { Button, Field, Modal, FormActions } from "./ui.jsx";
import ProfessionIcon from "./ProfessionIcon.jsx";
import { professionIcons } from "../shared/professions.js";
export default function Professions({ data, mutate, busy, ask }) {
  const [editing, setEditing] = useState(null);
  return (
    <section className="admin-panel">
      <div className="section-title">
        <h2>職業清單</h2>
        <Button
          primary
          onClick={() =>
            setEditing({ name: "", icon: professionIcons[0].icon })
          }
        >
          新增職業
        </Button>
      </div>
      <p className="hint">
        角色以職業圖示區分，滑鼠停留或鍵盤聚焦時顯示中文名稱。
      </p>
      {data.professions.map((p) => (
        <div className="admin-row" key={p.id}>
          <ProfessionIcon profession={p} />
          <strong>{p.name}</strong>
          <span className="muted">
            {data.characters.filter((c) => c.professionId === p.id).length} 角
          </span>
          <Button
            onClick={() => setEditing({ ...p })}
            aria-label={`編輯職業 ${p.name}`}
          >
            編輯
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              if (await ask(`刪除「${p.name}」？角色會改為未設定職業。`))
                mutate("profession.delete", { id: p.id });
            }}
          >
            刪除
          </Button>
        </div>
      ))}
      {editing && (
        <Modal
          title={editing.id ? "編輯職業" : "新增職業"}
          onClose={() => setEditing(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await mutate("profession.save", editing)) setEditing(null);
            }}
          >
            <Field
              label="職業中文名稱"
              required
              maxLength={40}
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <Field label="職業圖示">
              <select
                value={editing.icon || ""}
                onChange={(e) =>
                  setEditing({ ...editing, icon: e.target.value })
                }
              >
                {professionIcons.map((p) => (
                  <option key={p.id} value={p.icon}>
                    {p.name} · {p.english}
                  </option>
                ))}
              </select>
            </Field>
            <ProfessionIcon profession={editing} />
            <FormActions busy={busy} onClose={() => setEditing(null)} />
          </form>
        </Modal>
      )}
    </section>
  );
}
