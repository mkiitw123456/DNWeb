import { useEffect, useState } from "react";
import { apiRequest } from "./api.js";

export default function OverlayLicenses() {
  const [rows, setRows] = useState(null), [note, setNote] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    apiRequest("license.list", {}).then(r => active && setRows(r.licenses))
      .catch(e => active && setError(e.message));
    return () => { active = false; };
  }, []);
  async function save(type, payload) {
    setBusy(true); setError("");
    try {
      setRows((await apiRequest(type, payload)).licenses);
      if (type === "license.create") setNote("");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <section className="admin-panel"><h2>BOSS Overlay 授權碼</h2>
    <form onSubmit={e => { e.preventDefault(); save("license.create", { note }); }}>
      <label>使用者備註 <input maxLength={200} value={note} onChange={e => setNote(e.target.value)} /></label>
      <button disabled={busy || !rows}>建立授權碼</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {rows === null ? !error && <p>讀取中…</p> : !rows.length && <p>尚未建立授權碼</p>}
    {rows?.map(r => <form key={r.code} onSubmit={e => {
      e.preventDefault(); save("license.note", { code: r.code, note: e.currentTarget.elements.note.value });
    }}><p><code>{r.code}</code>　{r.activatedAt ? "已啟用" : "未啟用"}</p>
      <input aria-label="使用者備註" name="note" maxLength={200} defaultValue={r.note} />
      <button disabled={busy}>儲存備註</button></form>)}
  </section>;
}
