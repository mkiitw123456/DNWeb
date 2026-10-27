import { useState } from "react";
import { Heading, Button, Field, Modal, FormActions, Empty } from "./ui.jsx";

export default function Bounties({ data, mutate, busy, ask }) {
  const [category, setCategory] = useState("");
  const [editing, setEditing] = useState(null);
  const visible = data.bounties.filter(
    (b) => !category || b.dungeonId === category,
  );
  return (
    <>
      <Heading
        title="懸賞"
        description="所有成員公開的懸賞，不受群組限制"
        onAdd={() =>
          setEditing({
            name: "",
            dungeonId: category || data.dungeons[0]?.id || "",
          })
        }
        addLabel="新增懸賞"
      />
      <div className="bounty-filters">
        <Field label="關卡分類">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">所有關卡</option>
            {data.dungeons.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <p className="muted">{visible.length} 筆懸賞</p>
      </div>
      {visible.length ? (
        <div className="bounty-grid">
          {visible.map((b) => (
            <article className="bounty-card" key={b.id}>
              <span className="bounty-category">
                {data.dungeons.find((d) => d.id === b.dungeonId)?.name ||
                  "未分類"}
              </span>
              <h2>{b.name}</h2>
              <p className="muted">發布者 · {b.ownerName}</p>
              {(data.me.admin || b.ownerId === data.me.id) && (
                <div className="group-row">
                  <Button disabled={busy} onClick={() => setEditing({ ...b })}>
                    編輯
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={async () => {
                      if (await ask(`確定刪除懸賞「${b.name}」？`))
                        mutate("bounty.delete", { id: b.id }, "懸賞已刪除");
                    }}
                  >
                    刪除
                  </Button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="目前沒有懸賞"
          description="選擇關卡後新增自己的懸賞，所有登入成員都能看見。"
        />
      )}
      {editing && (
        <Modal
          title={editing.id ? "編輯懸賞" : "新增懸賞"}
          onClose={() => setEditing(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await mutate("bounty.save", editing)) setEditing(null);
            }}
          >
            <Field
              label="懸賞名稱"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              required
              maxLength={80}
            />
            <Field label="關卡">
              <select
                required
                value={editing.dungeonId}
                onChange={(e) =>
                  setEditing({ ...editing, dungeonId: e.target.value })
                }
              >
                <option value="" disabled>
                  請選擇關卡
                </option>
                {data.dungeons.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            {!data.dungeons.length && (
              <p className="hint">請管理員先新增副本關卡。</p>
            )}
            <FormActions
              busy={busy || !data.dungeons.length}
              onClose={() => setEditing(null)}
            />
          </form>
        </Modal>
      )}
    </>
  );
}
