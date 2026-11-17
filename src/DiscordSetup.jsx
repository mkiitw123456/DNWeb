import { useState } from "react";
import { Button, Field, Modal } from "./ui.jsx";
export default function DiscordSetup({ data, request, mutate, busy, onClose }) {
  const [query, setQuery] = useState(""),
    [results, setResults] = useState(null),
    [selected, setSelected] = useState(null),
    [error, setError] = useState(""),
    [searching, setSearching] = useState(false);
  return (
    <Modal
      title="設定 Discord 身分"
      explicitCloseOnly
      onClose={async () => {
        if (
          data.me.discordSetupDone ||
          (await mutate(
            "onboarding.discordSkip",
            {},
            "可稍後設定 Discord 身分",
          ))
        )
          onClose();
      }}
    >
      <p>
        輸入你在公會 Discord
        伺服器中的名稱，按下搜尋，再從結果中選擇自己。只記得部分名稱也可以搜尋。
      </p>
      {data.discordDirectoryConfigured ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSearching(true);
            setResults(null);
            setSelected(null);
            setError("");
            try {
              setResults(await request("discord.members", { query }));
            } catch (e) {
              setError(e.message);
            } finally {
              setSearching(false);
            }
          }}
        >
          <Field
            label="你在 Discord 伺服器中的名稱"
            disabled={searching || busy}
            placeholder="例如 Wo 或 lf"
            minLength={2}
            maxLength={80}
            required
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
              setError("");
              setResults(null);
            }}
          />
          <Button disabled={searching || busy}>
            {searching ? "搜尋中…" : "搜尋成員"}
          </Button>
        </form>
      ) : (
        <p className="muted">成員搜尋尚未開放，請聯絡管理員或稍後再設定。</p>
      )}
      {results && (
        <div className="discord-member-results">
          {results.members.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={busy}
              aria-pressed={selected?.id === m.id}
              onClick={() => {
                setSelected(m);
                setError("");
              }}
            >
              <strong>{m.displayName}</strong>
              <small>
                @{m.username}
                {selected?.id === m.id ? " · 已選取" : ""}
              </small>
            </button>
          ))}
          {!results.members.length && <p>找不到符合的成員，請換個關鍵字。</p>}
          {results.more && <p>還有更多結果，請輸入較完整的名稱。</p>}
        </div>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!selected || searching || busy) return;
          if (
            await mutate(
              "profile.discordRequest",
              { discordId: selected.id },
              "Discord 身分已送出，等待管理員確認",
            )
          )
            onClose();
        }}
      >
        {selected && (
          <p role="status">
            已選擇：<strong>{selected.displayName}</strong>（@
            {selected.username}）
          </p>
        )}
        <p className="muted">請確認選到自己的帳號，送出後由管理員確認身分。</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <Button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (
                await mutate(
                  "onboarding.discordSkip",
                  {},
                  "可稍後從 Discord 身分搜尋設定",
                )
              )
                onClose();
            }}
          >
            稍後設定
          </Button>
          <Button primary disabled={busy || searching || !selected}>
            送出確認
          </Button>
        </div>
      </form>
    </Modal>
  );
}
