import useSubmitDialog from "./useSubmitDialog.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Field, Modal } from "./ui.jsx";
import { notify } from "./FeedbackHost.jsx";
import "./guild-games.css";

const labels = {
  open: "開放報名",
  locked: "已封盤 · 等待結果",
  settled: "已結算",
  cancelled: "已取消",
};
const entryLabels = {
  pending: "待房主確認",
  approved: "已確認",
  rejected: "未通過",
  expired: "逾時未審核",
};
const when = (n) =>
  new Date(n).toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    hour12: false,
  });
export default function GuildGames({ kind, me, request, onUnauthorized }) {
  const [state, setState] = useState(null),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(null),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState("");
  const createRoom = useSubmitDialog();
  const { draft, setDraft } = createRoom;
  const [entry, setEntry] = useState({ optionId: "", amount: 1 }),
    [result, setResult] = useState({ winner: "", places: ["", "", ""] }),
    [confirm, setConfirm] = useState(null);
  const lock = useRef(false),
    sequence = useRef(0);
  const refresh = useCallback(async () => {
    const seq = ++sequence.current;
    const next = await request("game.state");
    if (seq === sequence.current) {
      setState(next);
      setError("");
    }
  }, [request]);
  useEffect(() => {
    let live = true,
      pending = false;
    async function poll() {
      if (!live || pending || lock.current || document.hidden) return;
      pending = true;
      try {
        await refresh();
      } catch (e) {
        if (live) {
          setError(e.message);
          if (e.status === 401) onUnauthorized();
        }
      } finally {
        pending = false;
      }
    }
    poll();
    const timer = setInterval(poll, 15000);
    return () => {
      live = false;
      sequence.current++;
      clearInterval(timer);
    };
  }, [refresh, onUnauthorized]);
  async function act(type, payload) {
    if (lock.current) return false;
    lock.current = true;
    sequence.current++;
    setBusy(true);
    try {
      const next = await request(type, payload);
      setState(next);
      setError("");
      notify("已儲存");
      return true;
    } catch (e) {
      notify(e.message, "error");
      if (e.status === 401) onUnauthorized();
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const rooms = (state?.rooms || []).filter((r) => r.kind === kind),
    room = rooms.find((r) => r.id === selected),
    members = state?.members || [];
  const name = (id) =>
    members.find((m) => m.id === id)?.name ||
    room?.entries.find((e) => e.userId === id)?.name ||
    room?.options.find((o) => o.id === id)?.name ||
    "已移除的會員";
  const owner = room?.canManage,
    own = room?.entries.find((e) => e.userId === me.id);
  const total =
    room?.entries
      .filter((e) => e.status === "approved")
      .reduce((n, e) => n + e.amount, 0) || 0;
  return (
    <div className="guild-games">
      <div className="section-title">
        <div>
          <h2>{kind === "race" ? "公會賽馬" : "公會預測"}</h2>
          <p className="muted">
            遊戲內金幣記錄 · 房主審核 · 封盤後鎖定 · 網站不代收或轉移金幣
          </p>
        </div>
        <Button
          primary
          onClick={() => {
            createRoom.open({ submissionId: crypto.randomUUID(), title: "", closesAt: "", riders: [] });
          }}
        >
          建立房間
        </Button>
      </div>
      {kind === "race" && (
        <p className="hint">
          前三名分配 50%／30%／20%；馬手各取該名次獎金的
          20%，其餘按支持金額比例分配。結果由房主填入。
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {state && !state.webhookConfigured && (
        <p className="hint">尚未設定賭場 Webhook，請到管理後台設定通知。</p>
      )}
      <div className="guild-game-grid">
        {rooms.map((r) => (
          <button
            className="guild-game-card"
            key={r.id}
            onClick={() => {
              createRoom.close();
              setSelected(r.id);
              setEntry({ optionId: "", amount: 1 });
              setResult({ winner: "", places: ["", "", ""] });
            }}
          >
            <span className="muted">{labels[r.status]}</span>
            <h3>{r.title}</h3>
            <p>房主 {r.ownerName}</p>
            <small>截止 {when(r.closesAt)}</small>
            <p>
              {r.entries.filter((e) => e.status === "approved").length} 人已確認
              ·{" "}
              {r.entries
                .filter((e) => e.status === "approved")
                .reduce((n, e) => n + e.amount, 0)
                .toLocaleString()}{" "}
              金幣
            </p>
          </button>
        ))}
      </div>
      {state && !rooms.length && (
        <div className="admin-panel muted">
          目前沒有房間，建立第一場公會活動吧。
        </div>
      )}
      {draft && (
        <Modal
          title={kind === "race" ? "建立賽馬場" : "建立預測房間"}
          onClose={createRoom.close}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await createRoom.submit((submitted) =>
                act("game.create", {
                  ...submitted,
                  kind,
                  closesAt: submitted.closesAt + ":00+08:00",
                })
              );
            }}
          >
            <Field
              label="標題"
              required
              maxLength={80}
              value={draft.title}
              placeholder={
                kind === "race" ? "今晚公會賽馬" : "這把強化會不會過 +9？"
              }
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
            <Field
              label="報名截止時間（台灣時間）"
              type="datetime-local"
              required
              value={draft.closesAt}
              onChange={(e) => setDraft({ ...draft, closesAt: e.target.value })}
            />
            {kind === "race" && (
              <fieldset>
                <legend>選擇 3 至 12 位馬手（{draft.riders.length} 位）</legend>
                <Field
                  label="搜尋馬手"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="game-riders">
                  {members
                    .filter((m) =>
                      m.name.toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((m) => (
                      <label key={m.id}>
                        <input
                          type="checkbox"
                          checked={draft.riders.includes(m.id)}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              riders: e.target.checked
                                ? [...draft.riders, m.id]
                                : draft.riders.filter((id) => id !== m.id),
                            })
                          }
                        />
                        {m.name}
                      </label>
                    ))}
                </div>
              </fieldset>
            )}
            <div className="form-actions">
              <Button type="button" onClick={createRoom.close}>
                取消
              </Button>
              <Button primary disabled={busy}>
                建立房間
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {room && (
        <Modal
          title={room.title}
          onClose={() => setSelected(null)}
          className="guild-game-modal"
        >
          <p className="muted">
            {labels[room.status]} · 房主 {room.ownerName} · 截止{" "}
            {when(room.closesAt)}
          </p>
          <div className="game-pot">
            <span>已確認總額</span>
            <strong>
              {total.toLocaleString()} <small>金幣</small>
            </strong>
          </div>
          <div className="game-options">
            {room.options.map((o) => (
              <div key={o.id}>
                <strong>{o.name}</strong>
                <span>
                  {room.entries
                    .filter(
                      (e) => e.status === "approved" && e.optionId === o.id,
                    )
                    .reduce((n, e) => n + e.amount, 0)
                    .toLocaleString()}{" "}
                  金幣
                </span>
              </div>
            ))}
          </div>
          {room.status === "open" && !own && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await act("game.join", {
                  id: room.id,
                  ...entry,
                  amount: Number(entry.amount),
                });
              }}
            >
              <Field label="支持對象">
                <select
                  required
                  value={entry.optionId}
                  onChange={(e) =>
                    setEntry({ ...entry, optionId: e.target.value })
                  }
                >
                  <option value="">請選擇</option>
                  {room.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="遊戲內金幣數量"
                type="number"
                required
                min={1}
                max={1000000}
                step={1}
                value={entry.amount}
                onChange={(e) => setEntry({ ...entry, amount: e.target.value })}
              />
              <Button primary disabled={busy}>
                申請報名
              </Button>
              <p className="hint">
                送出後不可更改支持對象與金額，請先核對；房主確認才會納入結算。
              </p>
            </form>
          )}
          {own && (
            <p className="hint">
              你的報名：{entryLabels[own.status]} ·{" "}
              {room.options.find((o) => o.id === own.optionId)?.name} ·{" "}
              {own.amount.toLocaleString()} 金幣
            </p>
          )}
          <h3>報名清單</h3>
          <div className="game-entry-list">
            {room.entries.map((e) => (
              <div key={e.userId}>
                <span>
                  <strong>{e.name}</strong> ·{" "}
                  {room.options.find((o) => o.id === e.optionId)?.name}
                  <small>
                    {e.amount.toLocaleString()} 金幣 · {entryLabels[e.status]}
                  </small>
                </span>
                {owner && room.status === "open" && e.status === "pending" && (
                  <span className="actions">
                    <Button
                      disabled={busy}
                      onClick={() =>
                        act("game.review", {
                          id: room.id,
                          userId: e.userId,
                          approved: true,
                        })
                      }
                    >
                      確認收到／加入
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        act("game.review", {
                          id: room.id,
                          userId: e.userId,
                          approved: false,
                        })
                      }
                    >
                      拒絕
                    </Button>
                  </span>
                )}
              </div>
            ))}
          </div>
          {owner && room.status === "open" && (
            <div className="form-actions">
              <Button
                disabled={busy}
                onClick={() =>
                  setConfirm({
                    type: "game.lock",
                    payload: { id: room.id },
                    label: "封盤後不可再報名或審核。確認封盤？",
                  })
                }
              >
                立即封盤
              </Button>
            </div>
          )}
          {owner && room.status === "locked" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setConfirm({
                  type: "game.settle",
                  payload: { id: room.id, ...result },
                  label: "確認遊戲內結果正確？結算後不能修改結果，請再次核對。",
                });
              }}
            >
              <h3>公布遊戲內結果</h3>
              {kind === "prediction" ? (
                <Field label="實際結果">
                  <select
                    required
                    value={result.winner}
                    onChange={(e) =>
                      setResult({ ...result, winner: e.target.value })
                    }
                  >
                    <option value="">請選擇</option>
                    {room.options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                result.places.map((id, i) => (
                  <Field key={i} label={`第 ${i + 1} 名馬手`}>
                    <select
                      required
                      value={id}
                      onChange={(e) =>
                        setResult({
                          ...result,
                          places: result.places.map((old, j) =>
                            i === j ? e.target.value : old,
                          ),
                        })
                      }
                    >
                      <option value="">請選擇</option>
                      {room.options.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                ))
              )}
              <p className="hint">
                若獲勝對象沒有已確認的支持者，請取消房間，按原額退回。
              </p>
              <Button primary disabled={busy}>
                確認結果並結算
              </Button>
            </form>
          )}
          {owner && ["open", "locked"].includes(room.status) && (
            <div className="form-actions">
              <Button
                disabled={busy}
                onClick={() =>
                  setConfirm({
                    type: "game.cancel",
                    payload: { id: room.id },
                    label: "取消房間並產生已確認報名的原額退回清單？",
                  })
                }
              >
                取消房間／原額退回
              </Button>
            </div>
          )}
          {room.result && (
            <div className="hint">
              <strong>結果：</strong>
              {room.result.winner
                ? room.options.find((o) => o.id === room.result.winner)?.name
                : room.result.places
                    .map((id, i) => `${i + 1}. ${name(id)}`)
                    .join(" ／ ")}
            </div>
          )}
          {["settled", "cancelled"].includes(room.status) && (
            <>
              <h3>
                {room.status === "cancelled"
                  ? "原額退回清單"
                  : "分配清單（含本金）"}
              </h3>
              <div className="game-entry-list">
                {room.payouts.map((p) => (
                  <div key={p.userId}>
                    <span>
                      {name(p.userId)}
                      <small>{p.amount.toLocaleString()} 金幣</small>
                    </span>
                    {p.paidAt ? (
                      <small>已標記交付 · {when(p.paidAt)}</small>
                    ) : owner ? (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          setConfirm({
                            type: "game.paid",
                            payload: { id: room.id, userId: p.userId },
                            label: `確認已在遊戲內交付 ${name(p.userId)} ${p.amount.toLocaleString()} 金幣？`,
                          })
                        }
                      >
                        標記已交付
                      </Button>
                    ) : (
                      <small>等待房主交付</small>
                    )}
                  </div>
                ))}
              </div>
              <p className="hint">
                網站僅提供計算與紀錄，金幣由房主在遊戲內交付。
              </p>
            </>
          )}
        </Modal>
      )}
      {confirm && (
        <Modal title="確認操作" onClose={() => setConfirm(null)}>
          <p>{confirm.label}</p>
          <div className="form-actions">
            <Button disabled={busy} onClick={() => setConfirm(null)}>
              返回核對
            </Button>
            <Button
              primary
              disabled={busy}
              onClick={async () => {
                if (await act(confirm.type, confirm.payload)) setConfirm(null);
              }}
            >
              確認
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
