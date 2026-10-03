import { useState } from "react";
import {
  Check,
  SquarePen,
  Trash2,
  Send,
  Wallet,
  CheckCheck,
} from "lucide-react";
import { Heading, Button, Modal, FormActions, Empty, money } from "./ui.jsx";
import { SaleFields } from "./Marketplace.jsx";
import ScopeFilter from "./ScopeFilter.jsx";
import { isRelated } from "./filters.js";
const date = (n) =>
  new Date(n).toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    hour12: false,
  });
const statuses = {
  pending: "等待通知",
  unconfigured: "尚未設定 Discord",
  sending: "通知處理中",
  sent: "Discord 已通知",
  failed: "Discord 通知失敗",
};
export default function Settlements({ data, mutate, busy, ask }) {
  const [history, setHistory] = useState(false),
    [editing, setEditing] = useState(null),
    [claiming, setClaiming] = useState(null);
  const [scope, setScope] = useState("mine");
  const scoped = data.settlements.filter(
    (x) => scope === "all" || isRelated(x, data.me.id),
  );
  const visible = scoped.filter((x) => Boolean(x.completedAt) === history);
  const pending = data.settlements.flatMap((item) => {
    const payout = item.payouts.find((p) => p.userId === data.me.id);
    return payout && !payout.claimedAt
      ? [{ id: item.id, amount: payout.amount }]
      : [];
  });
  const pendingTotal = pending.reduce((total, p) => total + p.amount, 0);
  return (
    <>
      <Heading title="結算" description="一起冒險，一起分享每一份收穫" />
      <section className="claim-summary" aria-label="我的待領總額">
        <span className="claim-summary-icon" aria-hidden="true">
          <Wallet size={22} strokeWidth={1.7} />
        </span>
        <div className="claim-summary-amount">
          <span>我的待領總額</span>
          <strong>
            {money(pendingTotal)} <small>金幣</small>
          </strong>
          <p>{pending.length} 筆待領款項 · 公會共同倉庫</p>
        </div>
        <div className="claim-summary-action">
          <Button
            primary
            disabled={busy || !pending.length}
            onClick={() =>
              setClaiming({ claims: pending, total: pendingTotal })
            }
          >
            <CheckCheck size={17} />
            一次領取全部
          </Button>
          <small>僅結清自己尚未領取的款項</small>
        </div>
      </section>
      <div className="toolbar">
        <ScopeFilter value={scope} onChange={setScope} />
        <span>{scoped.length} 筆結算</span>
      </div>
      <div className="tabs">
        <button
          className={!history ? "active" : ""}
          aria-pressed={!history}
          onClick={() => setHistory(false)}
        >
          待領取 <span>{scoped.filter((x) => !x.completedAt).length}</span>
        </button>
        <button
          className={history ? "active" : ""}
          aria-pressed={history}
          onClick={() => setHistory(true)}
        >
          歷史紀錄 <span>{scoped.filter((x) => x.completedAt).length}</span>
        </button>
      </div>
      {visible.length ? (
        <div className="settlement-list">
          {visible.map((item) => (
            <article className="settlement" key={item.id}>
              <header>
                <div>
                  <h2>{item.name}</h2>
                  <small>{date(item.createdAt)}</small>
                </div>
                <span className="status">
                  {item.payouts.filter((x) => x.claimedAt).length} /{" "}
                  {item.payouts.length} 已領取
                </span>
              </header>
              <div className="settlement-numbers">
                <span>
                  售出金額<strong>{money(item.price)}</strong>
                </span>
                <span>
                  交易稅<strong>− {money(item.tax)}</strong>
                </span>
                <span>
                  額外成本<strong>− {money(item.cost)}</strong>
                </span>
                <span>
                  分配總額<strong className="gold">{money(item.net)}</strong>
                </span>
              </div>
              <div className="payouts">
                {item.costNote && (
                  <p className="cost-note">
                    <span>成本備註</span>
                    {item.costNote}
                  </p>
                )}
                {item.payouts.map((p) => (
                  <div
                    key={p.userId}
                    className={p.claimedAt ? "payout claimed" : "payout"}
                  >
                    <span className="avatar">{p.username[0]}</span>
                    <div className="recipient">
                      <strong>{p.username}</strong>
                      <small>
                        {p.claimedAt
                          ? `已領取 · ${date(p.claimedAt)}`
                          : "等待領取"}
                      </small>
                    </div>
                    <strong>
                      {money(p.amount)} <small>金幣</small>
                    </strong>
                    {data.me.admin || data.me.id === p.userId ? (
                      <Button
                        primary={!p.claimedAt}
                        disabled={
                          busy || Boolean(p.claimedAt && !data.me.admin)
                        }
                        onClick={() =>
                          mutate(
                            "settlement.claim",
                            {
                              id: item.id,
                              userId: p.userId,
                              claimed: !p.claimedAt,
                            },
                            p.claimedAt
                              ? "已撤銷領取"
                              : "已確認領取；全部領完將移至歷史紀錄",
                          )
                        }
                      >
                        {p.claimedAt ? (
                          <>
                            <Check size={16} />
                            {data.me.admin ? "撤銷領取" : "已領取"}
                          </>
                        ) : (
                          "確認領取"
                        )}
                      </Button>
                    ) : (
                      <span className="claim-label">
                        {p.claimedAt ? "已領取" : "待領取"}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <footer>
                <small>
                  {statuses[item.notification] || "尚未通知"}
                  {item.completedAt && ` · 結算完成 ${date(item.completedAt)}`}
                </small>
                <div>
                  {(data.me.admin || data.me.id === item.ownerId) &&
                    item.notification !== "sent" && (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          mutate(
                            "notification.retry",
                            { id: item.id },
                            "已處理通知，請查看通知狀態",
                          )
                        }
                      >
                        <Send size={14} />
                        重試通知
                      </Button>
                    )}
                  {data.me.admin && (
                    <>
                      <Button
                        aria-label={`修改結算 ${item.name}`}
                        onClick={() => setEditing({ ...item })}
                      >
                        <SquarePen size={15} />
                      </Button>
                      <Button
                        aria-label={`刪除結算 ${item.name}`}
                        disabled={busy}
                        onClick={async () => {
                          if (await ask("永久刪除此結算紀錄？"))
                            mutate(
                              "settlement.delete",
                              { id: item.id },
                              "結算已刪除",
                            );
                        }}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </>
                  )}
                </div>
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title={history ? "還沒有完成的結算" : "目前沒有待領取的款項"}
          description={
            history
              ? "所有參與者領取完成後，紀錄會自動保存在這裡。"
              : "物品售出後，每位參與者的分帳會出現在這裡。"
          }
        />
      )}{" "}
      {editing && (
        <Modal title="修改結算" onClose={() => setEditing(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await mutate("settlement.edit", editing)) setEditing(null);
            }}
          >
            <SaleFields value={editing} onChange={setEditing} />
            <p className="hint">
              已有領取紀錄時，請先撤銷所有領取。修改後可重試 Discord 通知。
            </p>
            <FormActions busy={busy} onClose={() => setEditing(null)} />
          </form>
        </Modal>
      )}
      {claiming && (
        <Modal title="一次結清確認" onClose={() => !busy && setClaiming(null)}>
          <p className="bulk-claim-question">
            要一次結清這 {claiming.claims.length} 筆待領款項嗎？
          </p>
          <div className="bulk-claim-total">
            <span>本次領取總額</span>
            <strong>
              {money(claiming.total)} <small>金幣</small>
            </strong>
          </div>
          <p className="hint">
            請先確認已從公會共同倉庫領取這筆金額。確認後，這些分帳會標記為「已領取」；所有人都領完的結算會移入歷史紀錄。
          </p>
          <div className="form-actions">
            <Button disabled={busy} onClick={() => setClaiming(null)}>
              取消
            </Button>
            <Button
              primary
              disabled={busy}
              onClick={async () => {
                if (
                  await mutate(
                    "settlement.claimAll",
                    { claims: claiming.claims },
                    "這批款項已全部標記為領取",
                  )
                )
                  setClaiming(null);
              }}
            >
              {busy ? "結清中…" : "確認全部已領取"}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
