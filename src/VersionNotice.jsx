import { useEffect, useState } from "react";
export default function VersionNotice() {
  const [available, setAvailable] = useState(null);
  useEffect(() => {
    if (import.meta.env.DEV) return;
    let live = true,
      checking = false,
      controller;
    async function check() {
      if (checking) return;
      checking = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const r = await fetch(`/version.json?t=${Date.now()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!r.ok) return;
        const data = await r.json();
        if (live && typeof data.version === "string" && data.version.length > 0)
          setAvailable(data.version !== __APP_VERSION__ ? data.version : null);
      } catch {
        /* Offline or failed checks must not interrupt current work. */
      } finally {
        clearTimeout(timeout);
        checking = false;
      }
    }
    check();
    const timer = setInterval(check, 60000);
    return () => {
      live = false;
      clearInterval(timer);
      controller?.abort();
    };
  }, []);
  if (!available) return null;
  return (
    <aside className="version-notice" role="status">
      <span className="update-spinner" aria-hidden="true" />
      <div>
        <strong>網站有新版本</strong>
        <p>請重新整理以使用最新版。未儲存的內容請先儲存。</p>
        <button type="button" onClick={() => window.location.reload()}>
          重新整理頁面
        </button>
      </div>
    </aside>
  );
}
