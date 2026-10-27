import { useState } from "react";
import { Button, Field, Modal, FormActions } from "./ui.jsx";
export default function QuantityTypes({ data, mutate, busy, ask }) {
  const [editing, setEditing] = useState(null);
  return (
    <section className="admin-panel">
      <div className="section-title">
        <h2>自訂數量項目</h2>
        <Button primary onClick={() => setEditing({ name: "" })}>
          新增數量項目
        </Button>
      </div>
      <p className="hint">
        只有名稱與數量，各角色可自行設定數量，不隨副本每週重置。
      </p>
      {data.quantityTypes.map((t) => (
        <div className="admin-row" key={t.id}>
          <strong>{t.name}</strong>
          <Button onClick={() => setEditing({ ...t })}>編輯</Button>
          <Button
            disabled={busy}
            onClick={async () => {
              if (await ask(`刪除「${t.name}」及所有角色對應的數量？`))
                mutate("quantityType.delete", { id: t.id });
            }}
          >
            刪除
          </Button>
        </div>
      ))}
      {!data.quantityTypes.length && (
        <p className="muted">尚未建立數量項目。</p>
      )}
      {editing && (
        <Modal
          title={editing.id ? "編輯數量項目" : "新增數量項目"}
          onClose={() => setEditing(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await mutate("quantityType.save", editing)) setEditing(null);
            }}
          >
            <Field
              label="項目名稱"
              required
              maxLength={40}
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <FormActions busy={busy} onClose={() => setEditing(null)} />
          </form>
        </Modal>
      )}
    </section>
  );
}
