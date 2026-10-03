import { useState } from "react";
import { Plus, SquarePen, Trash2 } from "lucide-react";
import { Button, Field, Modal, FormActions } from "./ui.jsx";
export default function Professions({ data, mutate, busy, ask }) {
  const [editing, setEditing] = useState(null);
  return (
    <>
      <section className="admin-panel">
        <div className="section-title">
          <h2>職業清單</h2>
          <Button
            primary
            onClick={() => setEditing({ name: "", color: "#60a5fa" })}
          >
            <Plus size={17} />
            新增職業
          </Button>
        </div>
        <p className="hint">
          每個職業可自訂外框顏色。修改名稱或顏色後，所有對應角色卡會同步更新。
        </p>
        {(data.professions || []).map((p) => (
          <div className="admin-row" key={p.id}>
            <span
              className="color-swatch"
              style={{ background: p.color }}
              aria-label={"顏色 " + p.color}
            />
            <strong>{p.name}</strong>
            <span className="muted">
              {p.color} ·{" "}
              {data.characters.filter((c) => c.professionId === p.id).length} 角
            </span>
            <Button
              aria-label={"編輯職業 " + p.name}
              onClick={() => setEditing({ ...p })}
            >
              <SquarePen size={16} />
            </Button>
            <Button
              aria-label={"刪除職業 " + p.name}
              disabled={busy}
              onClick={async () => {
                if (
                  await ask(
                    `刪除「${p.name}」？使用此職業的角色會改為「未設定職業」，角色資料會保留。`,
                  )
                )
                  mutate("profession.delete", { id: p.id }, "職業已刪除");
              }}
            >
              <Trash2 size={16} />
            </Button>
          </div>
        ))}
        {!data.professions?.length && (
          <p className="muted">尚未建立職業，點選「新增職業」開始設定。</p>
        )}
      </section>
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
              label="職業名稱"
              required
              maxLength={40}
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <div className="profession-color-fields">
              <Field
                label="選擇外框顏色"
                type="color"
                value={
                  /^#[0-9a-f]{6}$/i.test(editing.color)
                    ? editing.color
                    : "#60a5fa"
                }
                onChange={(e) =>
                  setEditing({ ...editing, color: e.target.value })
                }
              />
              <Field
                label="外框色碼"
                required
                pattern="#[0-9a-fA-F]{6}"
                maxLength={7}
                value={editing.color}
                onChange={(e) =>
                  setEditing({ ...editing, color: e.target.value })
                }
              />
            </div>
            <div
              className="profession-preview"
              style={{
                borderColor: /^#[0-9a-f]{6}$/i.test(editing.color)
                  ? editing.color
                  : "#60a5fa",
              }}
            >
              <strong>{editing.name || "角色卡片預覽"}</strong>
              <small>角色資訊會使用這個外框顏色</small>
            </div>
            <FormActions busy={busy} onClose={() => setEditing(null)} />
          </form>
        </Modal>
      )}
    </>
  );
}
