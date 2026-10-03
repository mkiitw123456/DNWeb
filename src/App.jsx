import { useState, useEffect, useRef, useCallback } from "react";
import {
  UsersRound,
  Scale,
  ReceiptText,
  Settings,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { Button, Field, FormErrorContext, Modal } from "./ui.jsx";
import Characters from "./Characters.jsx";
import Marketplace from "./Marketplace.jsx";
import Settlements from "./Settlements.jsx";
import Admin from "./Admin.jsx";
export default function App() {
  const [data, setData] = useState(null),
    [loading, setLoading] = useState(true),
    [page, setPage] = useState("characters"),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const revision = useRef(0);
  const [confirmation, setConfirmation] = useState(null);
  const ask = (message) =>
    new Promise((resolve) => setConfirmation({ message, resolve }));
  const answer = (value) => {
    confirmation.resolve(value);
    setConfirmation(null);
  };
  const request = useCallback(async (type, payload) => {
    const response = await fetch(
      "/api/app",
      type
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type, payload }),
          }
        : {},
    );
    const result = await response.json();
    if (!response.ok) {
      throw Object.assign(new Error(result.error), { status: response.status });
    }
    return result;
  }, []);
  useEffect(() => {
    let live = true;
    const refresh = () => {
      if (lock.current) return;
      const current = ++revision.current;
      request()
        .then((d) => {
          if (live && current === revision.current) setData(d);
        })
        .catch((e) => {
          if (live && current === revision.current) {
            if (e.status === 401) setData(null);
            if (e.message !== "請先登入") setError(e.message);
          }
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    };
    refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [request]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  async function mutate(type, payload, message = "已儲存") {
    if (lock.current) return false;
    lock.current = true;
    revision.current++;
    setBusy(true);
    setError("");
    try {
      setData(await request(type, payload));
      setToast(message);
      return true;
    } catch (e) {
      if (e.status === 401) setData(null);
      setError(e.message);
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const shared = { data, mutate, busy, ask };
  if (loading) return <div className="loading">正在開啟 DNWeb…</div>;
  if (!data)
    return (
      <main className="login">
        <div className="login-brand">
          DN<span>DNWeb</span>
        </div>
        <section>
          <h1>歡迎回來</h1>
          <p>登入，準備下一場冒險。</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              await mutate("login", Object.fromEntries(form), "登入成功");
            }}
          >
            <Field
              label="帳號"
              name="username"
              autoComplete="username"
              required
            />
            <Field
              label="密碼"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <Button primary disabled={busy}>
              {busy ? "登入中…" : "登入 DNWeb"}
              <ChevronRight size={18} />
            </Button>
          </form>
          <small>帳號由公會管理員建立</small>
        </section>
      </main>
    );
  const nav = [
    ["characters", "角色資訊", UsersRound],
    ["market", "交易所", Scale],
    ["settlements", "結算", ReceiptText],
  ];
  return (
    <FormErrorContext.Provider value={error}>
      <div className="app">
        <aside className="sidebar">
          <div className="brand">
            <span>DN</span>
            <strong>DNWeb</strong>
          </div>
          <nav>
            {nav.map(([id, label, Icon]) => (
              <button
                key={id}
                className={page === id ? "active" : ""}
                onClick={() => setPage(id)}
              >
                <Icon size={22} />
                {label}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            {data.me.admin && (
              <button
                className={page === "admin" ? "active" : ""}
                onClick={() => setPage("admin")}
              >
                <Settings size={22} />
                管理後台
              </button>
            )}
            <div className="user">
              <span className="avatar">{data.me.username[0]}</span>
              <div>
                {data.me.username}
                <small>{data.me.admin ? "管理員" : "公會成員"}</small>
              </div>
              <button
                aria-label="登出"
                onClick={async () => {
                  try {
                    await request("logout");
                    setData(null);
                    setError("");
                  } catch (e) {
                    setError(e.message);
                  }
                }}
              >
                <LogOut size={17} />
              </button>
            </div>
            <small className="storage">{data.storage} · 台灣時間</small>
          </div>
        </aside>
        <main className="main">
          {error && (
            <div className="error banner" role="alert">
              {error}
              <button onClick={() => setError("")}>關閉</button>
            </div>
          )}
          {page === "characters" ? (
            <Characters {...shared} />
          ) : page === "market" ? (
            <Marketplace {...shared} />
          ) : page === "settlements" ? (
            <Settlements {...shared} />
          ) : data.me.admin ? (
            <Admin {...shared} />
          ) : null}
        </main>
        {confirmation && (
          <Modal title="確認操作" onClose={() => answer(false)}>
            <p>{confirmation.message}</p>
            <div className="form-actions">
              <Button onClick={() => answer(false)}>取消</Button>
              <Button primary onClick={() => answer(true)}>
                確認
              </Button>
            </div>
          </Modal>
        )}
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </div>
    </FormErrorContext.Provider>
  );
}
