import { useState } from "react";
import { Heading, Button, Field, Modal, FormActions, Empty } from "./ui.jsx";

function ItemImage({ url, name }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div className="item-image-placeholder">圖片無法載入</div>
  ) : (
    <img
      className="item-image"
      src={url}
      alt={name}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

export default function ItemBoard({ data, mutate, busy, ask }) {
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("available");
  const [mine, setMine] = useState(false);
  const visible = data.itemPosts.filter(
    (p) =>
      (!status || p.status === status) &&
      (!mine || p.ownerId === data.me.id) &&
      `${p.name} ${p.description} ${p.ownerName}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <Heading
        title="物品交流"
        description="查看所有成員刊登的物品、圖片與說明"
        addLabel="刊登物品"
        onAdd={() =>
          setEditing({
            name: "",
            imageUrl: "",
            description: "",
            status: "available",
          })
        }
      />
      <div className="item-toolbar">
        <Field
          label="搜尋物品"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="名稱、說明或發布者"
        />
        <Field label="物品狀態">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="available">刊登中</option>
            <option value="closed">已結束</option>
            <option value="">全部</option>
          </select>
        </Field>
        <Button aria-pressed={mine} onClick={() => setMine(!mine)}>
          {mine ? "顯示：自己的物品" : "顯示：所有人的物品"}
        </Button>
      </div>
      {visible.length ? (
        <div className="bounty-grid">
          {visible.map((p) => (
            <article
              className="bounty-card item-card"
              key={p.id}
              aria-label={`物品 ${p.name}`}
            >
              <ItemImage key={p.imageUrl} url={p.imageUrl} name={p.name} />
              <h2>{p.name}</h2>
              <p className="item-description">{p.description}</p>
              <p className="muted">
                發布者 · {p.ownerName} ·{" "}
                {p.status === "available" ? "刊登中" : "已結束"}
              </p>
              {(data.me.admin || p.ownerId === data.me.id) && (
                <div className="group-row">
                  <Button disabled={busy} onClick={() => setEditing({ ...p })}>
                    編輯
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={async () => {
                      if (await ask(`確定刪除物品「${p.name}」？`))
                        mutate("itemPost.delete", { id: p.id }, "物品已刪除");
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
          title="目前沒有符合的物品"
          description="刊登自己的物品，或調整搜尋條件。"
        />
      )}
      {editing && (
        <Modal
          title={editing.id ? "編輯物品" : "刊登物品"}
          onClose={() => setEditing(null)}
          explicitCloseOnly
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await mutate("itemPost.save", editing, "物品已儲存"))
                setEditing(null);
            }}
          >
            <Field
              label="物品名稱"
              required
              maxLength={80}
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <Field
              label="圖片網址"
              type="url"
              required
              pattern="https://.*"
              maxLength={2000}
              value={editing.imageUrl}
              placeholder="https://… 圖片直連網址"
              onChange={(e) =>
                setEditing({ ...editing, imageUrl: e.target.value })
              }
            />
            <p className="hint">
              請使用可直接開啟圖片的 HTTPS 網址，Google
              雲端硬碟分享頁無法直接顯示為圖片。
            </p>
            {/^https:\/\//i.test(editing.imageUrl) && (
              <ItemImage
                key={editing.imageUrl}
                url={editing.imageUrl}
                name="物品圖片預覽"
              />
            )}
            <Field label="文字說明">
              <textarea
                required
                maxLength={2000}
                rows={5}
                value={editing.description}
                placeholder="物品屬性、交換條件或聯絡方式"
                onChange={(e) =>
                  setEditing({ ...editing, description: e.target.value })
                }
              />
            </Field>
            <Field label="刊登狀態">
              <select
                value={editing.status}
                onChange={(e) =>
                  setEditing({ ...editing, status: e.target.value })
                }
              >
                <option value="available">刊登中</option>
                <option value="closed">已結束</option>
              </select>
            </Field>
            <FormActions busy={busy} onClose={() => setEditing(null)} />
          </form>
        </Modal>
      )}
    </>
  );
}
