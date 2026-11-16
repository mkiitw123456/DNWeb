import { useState } from "react";
import { Button, Field, Modal } from "./ui.jsx";
export default function DiscordSetup({ data, request, mutate, busy, onClose }) {
  const [query, setQuery] = useState(""),
    [results, setResults] = useState(null),
    [id, setId] = useState(data.me.discordPendingId || data.me.discordId || ""),
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
        填寫公會 Discord 的使用者 ID，之後出團通知就能標記你。現在也可以先略過。
      </p>
      {data.discordDirectoryConfigured ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSearching(true);
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
            label="搜尋伺服器暱稱或帳號"
            placeholder="例如 Wo 或 lf"
            minLength={2}
            maxLength={80}
            required
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setResults(null);
            }}
          />
          <Button disabled={searching}>
            {searching ? "搜尋中…" : "搜尋成員"}
          </Button>
        </form>
      ) : (
        <p className="muted">
          管理員尚未啟用 Bot 成員搜尋。可先手動填寫，或稍後再設定。
        </p>
      )}
      {results && (
        <div className="discord-member-results">
          {results.members.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setId(m.id);
                setError("");
              }}
            >
              <strong>{m.displayName}</strong>
              <small>
                @{m.username} · {m.id}
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
          if (
            await mutate(
              "profile.discordRequest",
              { discordId: id },
              "Discord ID 已送出，等待管理員確認",
            )
          )
            onClose();
        }}
      >
        <Field
          label="Discord 使用者 ID"
          inputMode="numeric"
          pattern="[0-9]{17,20}"
          minLength={17}
          maxLength={20}
          required
          value={id}
          onChange={(e) => setId(e.target.value)}
        />
        <details>
          <summary>不知道 ID 在哪裡？</summary>
          <p>
            在 Discord「使用者設定 →
            進階」開啟開發者模式，再對自己的名稱按右鍵，選擇「複製使用者 ID」。
          </p>
        </details>
        <p className="muted">
          選取暱稱僅協助填入 ID，不代表驗證身分；管理員確認後才會正式綁定。
        </p>
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
                  "可稍後從 Discord 身分設定補填",
                )
              )
                onClose();
            }}
          >
            稍後設定
          </Button>
          <Button primary disabled={busy}>
            送出確認
          </Button>
        </div>
      </form>
    </Modal>
  );
}
