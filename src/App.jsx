import ThemeSettings, { applyTheme, loadTheme } from "./ThemeSettings.jsx";
import DiscordSetup from "./DiscordSetup.jsx";
import GuidedTour from "./GuidedTour.jsx";
import "./personalization.css";
import { apiRequest, initialSession } from "./api.js";
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  lazy,
  Suspense,
} from "react";
import {
  CalendarDays,
  Compass,
  UsersRound,
  Settings,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { Button, Field, FormErrorContext, Modal } from "./ui.jsx";
const Characters = lazy(() => import("./Characters.jsx"));
const Admin = lazy(() => import("./Admin.jsx"));
const Raids = lazy(() => import("./Raids.jsx"));
import Lobby from "./Lobby.jsx";
// Re-enable this flag to restore the retained raid scheduling page.
const SHOW_RAID_SCHEDULING = false;
export default function App() {
  const [data, setData] = useState(null),
    [loading, setLoading] = useState(true),
    [page, setPage] = useState("lobby"),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const revision = useRef(0);
  const [confirmation, setConfirmation] = useState(null);
  const [registering, setRegistering] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false),
    [discordOpen, setDiscordOpen] = useState(false),
    [tourOpen, setTourOpen] = useState(false);
  useEffect(() => {
    applyTheme(loadTheme(data?.me.id || "guest"));
  }, [data?.me.id]);
  const [sessionChecked, setSessionChecked] = useState(false);
  const ask = (message) =>
    new Promise((resolve) => setConfirmation({ message, resolve }));
  const answer = (value) => {
    confirmation.resolve(value);
    setConfirmation(null);
  };
  const request = apiRequest;
  useEffect(() => {
    let live = true;
    const refresh = (initial = false) => {
      if (lock.current) return;
      const current = ++revision.current;
      (initial === true ? initialSession : request())
        .then((d) => {
          if (live && current === revision.current) {
            setData(d);
            setSessionChecked(true);
          }
        })
        .catch((e) => {
          if (live && current === revision.current) {
            if (e.status === 401) {
              setData(null);
              setSessionChecked(true);
            }
            if (e.message !== "請先登入") setError(e.message);
          }
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    };
    refresh(true);
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
  const onUnauthorized = useCallback(() => setData(null), []);
  const onActivityChange = useCallback((activity) => {
    // An activity mutation may complete while an older shell refresh is in flight.
    revision.current++;
    setData((current) => (current ? { ...current, activity } : current));
  }, []);
  const shared = {
    data,
    mutate,
    busy,
    ask,
    request,
    onUnauthorized,
    onActivityChange,
  };
  const discordNeeded =
    data &&
    !data.me.discordSetupDone &&
    !data.me.discordId &&
    !data.me.discordPendingId;
  const tourNeeded = data && !data.me.tourCompleted;
  if (loading)
    return (
      <div className="session-loading">
        <div className="brand">
          <img
            className="brand-logo"
            src="/ddstar-logo.png"
            alt="DDStar 公會標誌"
            width="40"
            height="40"
          />
          <strong>DDStar</strong>
        </div>
        <h1>冒險大廳</h1>
        <p>正在安全恢復登入，準備今天的小冒險…</p>
      </div>
    );
  if (!data && !sessionChecked)
    return (
      <div className="session-loading">
        <h1>暫時無法恢復連線</h1>
        <p>{error || "請檢查網路連線後再試一次。"}</p>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              setData(await request());
              setSessionChecked(true);
            } catch (e) {
              if (e.status === 401) setSessionChecked(true);
              else setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "重新連線中…" : "重新連線"}
        </Button>
      </div>
    );
  if (!data)
    return (
      <main className="login">
        <div className="login-brand brand">
          <img
            className="brand-logo"
            src="/ddstar-logo.png"
            alt="DDStar 公會標誌"
            width="40"
            height="40"
          />
          <strong>DDStar</strong>
        </div>
        <section>
          <h1>{registering ? "建立帳號" : "歡迎回來"}</h1>
          <p>
            {registering
              ? "輸入帳號與密碼，註冊後立即登入。"
              : "登入，準備下一場冒險。"}
          </p>
          <form
            key={registering ? "register" : "login"}
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              if (
                await mutate(
                  registering ? "register" : "login",
                  Object.fromEntries(form),
                  registering ? "註冊成功，已登入" : "登入成功",
                )
              ) {
                setPage("lobby");
                setRegistering(false);
              }
            }}
          >
            <Field
              label="帳號"
              name="username"
              autoComplete="username"
              maxLength={30}
              required
            />
            <Field
              label="密碼"
              name="password"
              type="password"
              autoComplete={registering ? "new-password" : "current-password"}
              maxLength={128}
              required
            />
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <Button primary disabled={busy}>
              {busy
                ? registering
                  ? "註冊中…"
                  : "登入中…"
                : registering
                  ? "註冊並登入"
                  : "登入 DDStar"}
              <ChevronRight size={18} />
            </Button>
          </form>
          <Button
            type="button"
            disabled={busy}
            onClick={() => {
              setRegistering(!registering);
              setError("");
            }}
          >
            {registering ? "已有帳號？返回登入" : "註冊帳號"}
          </Button>
          <small>保持登入，下次開啟即可繼續使用。</small>
        </section>
      </main>
    );
  const nav = [
    ["lobby", "冒險大廳", Compass],
    ["characters", "角色資訊", UsersRound],
    ...(SHOW_RAID_SCHEDULING ? [["raids", "出團排班", CalendarDays]] : []),
  ];
  return (
    <FormErrorContext.Provider value={error}>
      <div className="app">
        <aside className="sidebar">
          <div className="brand">
            <img
              className="brand-logo"
              src="/ddstar-logo.png"
              alt="DDStar 公會標誌"
              width="40"
              height="40"
            />
            <strong>DDStar</strong>
          </div>
          <nav aria-label="主要導覽">
            {nav.map(([id, label, Icon]) => (
              <button
                key={id}
                className={page === id ? "active" : ""}
                aria-current={page === id ? "page" : undefined}
                onClick={() => setPage(id)}
              >
                <Icon size={19} strokeWidth={1.7} />
                {label}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="personal-preferences" data-tour="preferences">
              <button onClick={() => setThemeOpen(true)}>外觀設定</button>
              <button onClick={() => setDiscordOpen(true)}>
                Discord 身分{data.me.discordPendingId ? " · 待確認" : ""}
              </button>
              <button onClick={() => setTourOpen(true)}>新手導覽</button>
            </div>
            {data.me.admin && (
              <button
                className={page === "admin" ? "active" : ""}
                aria-current={page === "admin" ? "page" : undefined}
                aria-label="管理後台"
                onClick={() => setPage("admin")}
              >
                <Settings size={19} strokeWidth={1.7} />
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
                disabled={busy}
                onClick={async () => {
                  if (lock.current) return;
                  lock.current = true;
                  revision.current++;
                  setBusy(true);
                  try {
                    await request("logout");
                    setPage("lobby");
                    setData(null);
                    setError("");
                  } catch (e) {
                    setError(e.message);
                  } finally {
                    lock.current = false;
                    setBusy(false);
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
          <div key={page} className="view-transition">
            <Suspense fallback={<div className="loading">正在開啟頁面…</div>}>
              {page === "lobby" ? (
                <Lobby
                  data={data}
                  request={request}
                  onUnauthorized={onUnauthorized}
                  onActivityChange={onActivityChange}
                />
              ) : page === "characters" ? (
                <Characters {...shared} />
              ) : SHOW_RAID_SCHEDULING && page === "raids" ? (
                <Raids {...shared} />
              ) : page === "admin" && data.me.admin ? (
                <Admin {...shared} />
              ) : null}
            </Suspense>
          </div>
        </main>
        {themeOpen && (
          <ThemeSettings
            userId={data.me.id}
            onClose={() => setThemeOpen(false)}
          />
        )}
        {(discordOpen || discordNeeded) && (
          <DiscordSetup {...shared} onClose={() => setDiscordOpen(false)} />
        )}
        {!discordOpen && !discordNeeded && (tourOpen || tourNeeded) && (
          <GuidedTour
            setPage={setPage}
            busy={busy}
            onFinish={async () => {
              if (
                await mutate(
                  "onboarding.tourComplete",
                  {},
                  "可隨時重新開啟導覽",
                )
              )
                setTourOpen(false);
            }}
          />
        )}
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
