import { useState } from "react";
import { SquarePen, Trash2, ArrowUpRight, Gem } from "lucide-react";
import ScopeFilter from "./ScopeFilter.jsx";
import { isRelated } from "./filters.js";
import {
  Heading,
  Button,
  Field,
  NumberField,
  Modal,
  FormActions,
  Empty,
  money,
} from "./ui.jsx";
export function SaleFields({ value, onChange, users }) {
  const set = (key, v) => onChange({ ...value, [key]: v });
  const net =
    Number(value.price || 0) -
    (value.taxed ? Math.floor(Number(value.price || 0) / 10) : 0) -
    Number(value.cost || 0);
  return (
    <>
      <Field
        label="物品名稱"
        required
        maxLength={80}
        value={value.name}
        onChange={(e) => set("name", e.target.value)}
      />
      <div className="form-grid two">
        <NumberField
          label="販賣金額"
          max={1e12}
          value={value.price}
          onChange={(e) =>
            set("price", e.target.value === "" ? "" : Number(e.target.value))
          }
        />
        <NumberField
          label="額外成本"
          max={1e12}
          value={value.cost}
          onChange={(e) =>
            set("cost", e.target.value === "" ? "" : Number(e.target.value))
          }
        />
      </div>
      <Field label="額外成本備註（選填）">
        <textarea
          rows={2}
          maxLength={300}
          value={value.costNote || ""}
          onChange={(e) => set("costNote", e.target.value)}
          placeholder="例如：封印費、材料費、代售手續費"
        />
      </Field>
      <label className="switch-row">
        <span>扣除交易所 10% 稅金</span>
        <input
          type="checkbox"
          role="switch"
          checked={value.taxed}
          onChange={(e) => set("taxed", e.target.checked)}
        />
      </label>
      {users && (
        <fieldset>
          <legend>參與者</legend>
          <div className="participants">
            {users
              .filter((u) => u.active)
              .map((u) => (
                <label
                  key={u.id}
                  className={
                    value.participants.includes(u.id) ? "selected" : ""
                  }
                >
                  <span>{u.username}</span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={value.participants.includes(u.id)}
                    onChange={(e) =>
                      set(
                        "participants",
                        e.target.checked
                          ? [...value.participants, u.id]
                          : value.participants.filter((id) => id !== u.id),
                      )
                    }
                  />
                </label>
              ))}
          </div>
        </fieldset>
      )}
      <div className="calculation">
        <span>
          可分配金額
          <strong>
            {money(net)} <small>金幣</small>
          </strong>
        </span>
        {value.participants?.length > 0 && (
          <span>
            每人領取
            <strong>
              {money(Math.floor(net / value.participants.length))}
            </strong>
          </span>
        )}
      </div>
      <p className="hint">
        先扣交易稅，再扣成本，最後平均分配。每人金額無條件捨去至整數，餘額由賣家保留。
      </p>
    </>
  );
}
export default function Marketplace({ data, mutate, busy, ask }) {
  const [editing, setEditing] = useState(null);
  const [scope, setScope] = useState("mine");
  const listings = data.listings.filter(
    (x) => !x.soldId && (scope === "all" || isRelated(x, data.me.id)),
  );
  const canEdit = (item) => data.me.admin || item.ownerId === data.me.id;
  return (
    <>
      <Heading
        title="交易所"
        description="記錄戰利品，讓每一份收穫分配清楚"
        onAdd={() =>
          setEditing({
            name: "",
            price: 0,
            cost: 0,
            taxed: true,
            participants: [data.me.id],
          })
        }
        addLabel="新增物品"
      />
      <div className="toolbar">
        <ScopeFilter value={scope} onChange={setScope} />
        <span>{listings.length} 件待售物品</span>
        <span>售出後自動建立結算</span>
      </div>
      {listings.length ? (
        <div className="market-list">
          {listings.map((item) => (
            <article key={item.id} className="market-item">
              <div className="item-symbol" aria-hidden="true">
                <Gem size={23} strokeWidth={1.5} />
              </div>
              <div className="item-info">
                <h2>{item.name}</h2>
                <p>
                  {item.participants
                    .map((id) => data.users.find((u) => u.id === id)?.username)
                    .join("、")}
                </p>
                <small>
                  {item.taxed ? "交易稅 10%" : "不扣交易稅"} · 成本{" "}
                  {money(item.cost)}
                </small>
                {item.costNote && (
                  <p className="cost-note">
                    <span>成本備註</span>
                    {item.costNote}
                  </p>
                )}
              </div>
              <div className="price">
                {money(item.price)}
                <small>金幣</small>
              </div>
              {canEdit(item) && (
                <div className="item-actions">
                  <Button
                    aria-label={`編輯 ${item.name}`}
                    onClick={() => setEditing({ ...item })}
                  >
                    <SquarePen size={17} />
                  </Button>
                  <Button
                    aria-label={`刪除 ${item.name}`}
                    disabled={busy}
                    onClick={async () => {
                      if (await ask("確定刪除此待售物品？"))
                        mutate("listing.delete", { id: item.id }, "物品已刪除");
                    }}
                  >
                    <Trash2 size={17} />
                  </Button>
                  <Button
                    primary
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await ask(
                          `確認「${item.name}」已售出？將建立分帳並發送 Discord 通知。`,
                        )
                      )
                        mutate(
                          "listing.sell",
                          { id: item.id },
                          "已售出，請到結算查看分帳",
                        );
                    }}
                  >
                    賣出
                    <ArrowUpRight size={17} />
                  </Button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title={
            scope === "mine"
              ? "沒有與你有關的待售物品"
              : "下一件戰利品，準備上架"
          }
          description="新增物品與參與成員，售出後即會產生每人的分帳。"
        />
      )}
      {editing && (
        <Modal
          title={editing.id ? "編輯物品" : "新增物品"}
          onClose={() => setEditing(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await mutate("listing.save", editing)) setEditing(null);
            }}
          >
            <SaleFields
              value={editing}
              onChange={setEditing}
              users={data.users}
            />
            <FormActions busy={busy} onClose={() => setEditing(null)} />
          </form>
        </Modal>
      )}
    </>
  );
}
