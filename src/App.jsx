import { useStarRewards } from "./StarRewards.jsx";
import { notify, useFeedback } from "./FeedbackHost.jsx";
import StarLoading from "./StarLoading.jsx";
import SettingsPanel from "./SettingsPanel.jsx";
import ThemeSettings, { applyTheme, loadTheme } from "./ThemeSettings.jsx";
import DiscordSetup from "./DiscordSetup.jsx";
import GuidedTour from "./GuidedTour.jsx";
import "./personalization.css";
import { apiRequest, initialSession } from "./api.js";
import useCharacterSaves from "./useCharacterSaves.js";
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
  ShieldCheck,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { Button, Field, FormErrorContext, Modal } from "./ui.jsx";
const Casino = lazy(() => import("./Casino.jsx"));
const Characters = lazy(() => import("./Characters.jsx"));
const Admin = lazy(() => import("./Admin.jsx"));
const Raids = lazy(() => import("./Raids.jsx"));
import Lobby from "./Lobby.jsx";
// Re-enable this flag to restore the retained raid scheduling page.
const SHOW_RAID_SCHEDULING = false;
function duplicateWrite(pending, type, payload) {
  const target = payload.id ?? payload.channel ?? payload.createKey ?? "";
  const last = pending.findLast((w) => w.type === type && w.target === target);
  if (!last) return false;
  // A changed value can be submitted while the previous edit is being saved.
  // Creates, deletions and other one-shot actions only run once per target.
  const editable =
    type === "profile.nickname" ||
    type === "discordSettings.save" ||
    type === "webhook.save" ||
    (type.endsWith(".save") && !!payload.id);
  return !editable || last.signature === JSON.stringify(payload);
}
export default function App() {
  const [data, setData] = useState(null),
    [loading, setLoading] = useState(true),
    [page, setPage] = useState("lobby"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const { sync: syncStars } = useStarRewards();
  useEffect(() => {
    syncStars(data?.me.id ?? null, data?.activity?.member?.total);
  }, [data?.me.id, data?.activity?.member?.total, syncStars]);
  const lock = useRef(false);
  const revision = useRef(0);
  const refreshShell = useRef(null);
  const tail = useRef(Promise.resolve());
  const writes = useRef([]);
  const [pendingWrites, setPendingWrites] = useState([]);
  const authVersion = useRef(0);
  const sessionMember = useRef(null);
  const generation = authVersion.current;
  const invalidate = useCallback((expected) => {
    if (authVersion.current !== expected) return;
    authVersion.current++;
    sessionMember.current = null;
    revision.current++;
    setData(null);
  }, []);
  const onUnauthorized = useCallback(
    () => invalidate(generation),
    [generation, invalidate],
  );
  const enqueueWrite = useCallback((work) => {
    const result = tail.current.then(work);
    tail.current = result.catch(() => {});
    return result;
  }, []);
  const characterSaves = useCharacterSaves(
    setData,
    revision,
    refreshShell,
    enqueueWrite,
    {
      isCurrent: () => authVersion.current === generation,
      onUnauthorized,
    },
  );
  const { hasPending } = characterSaves;
  const isSaving = (type, payload = {}) =>
    busy || duplicateWrite(pendingWrites, type, payload);
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
      if (
        lock.current ||
        writes.current.length ||
        hasPending.current ||
        (initial !== true && document.hidden)
      )
        return;
      const current = ++revision.current;
      const expected = authVersion.current;
      (initial === true ? initialSession : request())
        .then((d) => {
          if (live && current === revision.current) {
            const memberId = d?.me?.id ?? null;
            if (sessionMember.current !== memberId) {
              authVersion.current++;
              sessionMember.current = memberId;
            }
            setData(d);
            setSessionChecked(true);
          }
        })
        .catch((e) => {
          if (live && current === revision.current) {
            if (e.status === 401) {
              invalidate(expected);
              setSessionChecked(true);
            }
            if (e.message !== "請先登入") setError(e.message);
          }
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    };
    refreshShell.current = refresh;
    refresh(true);
    const timer = setInterval(refresh, 120000);
    window.addEventListener("focus", refresh);
    return () => {
      live = false;
      refreshShell.current = null;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [request, hasPending, invalidate]);
  useFeedback(error);
  async function mutate(type, payload, message = "已儲存") {
    if (lock.current || duplicateWrite(writes.current, type, payload))
      return false;
    const auth = type === "login" || type === "register";
    if (auth) {
      lock.current = true;
      setBusy(true);
    }
    const version = authVersion.current;
    const ticket = {
      type,
      target: payload.id ?? payload.channel ?? payload.createKey ?? "",
      signature: JSON.stringify(payload),
    };
    writes.current = [...writes.current, ticket];
    setPendingWrites(writes.current);
    revision.current++;
    setError("");
    characterSaves.flush();
    let reconcile = false;
    try {
      return await enqueueWrite(async () => {
        if (authVersion.current !== version) return false;
        const next = await request(type, payload);
        if (authVersion.current !== version) return false;
        revision.current++;
        if (auth) {
          authVersion.current++;
          sessionMember.current = next.me.id;
        }
        setData((current) => {
          if (
            !next ||
            !current ||
            current.me.id !== next.me.id ||
            current.me.admin !== next.me.admin
          )
            return next;
          return { ...next, activity: next.activity ?? current.activity };
        });
        notify(message);
        return next || true;
      });
    } catch (e) {
      if (authVersion.current !== version) return false;
      if (e.status === 401) invalidate(version);
      reconcile = !auth && (!e.status || e.status >= 500);
      if (auth) setError(e.message);
      else notify(e.message, "error");
      return false;
    } finally {
      writes.current = writes.current.filter((w) => w !== ticket);
      setPendingWrites(writes.current);
      if (auth) {
        lock.current = false;
        setBusy(false);
      }
      if (reconcile) tail.current.then(() => refreshShell.current?.());
    }
  }
  const shellSaving = pendingWrites.length > 0;
  useEffect(() => {
    if (!shellSaving) return;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = true;
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [shellSaving]);
  const onActivityChange = useCallback(
    (activity) => {
      // An activity mutation may complete while an older shell refresh is in flight.
      if (authVersion.current !== generation) return;
      revision.current++;
      setData((current) => {
        if (!current || authVersion.current !== generation) return current;
        if (activity === null) return { ...current, activity: null };
        if (
          current.me.id !== activity?.member?.memberId ||
          (activity.adminConfig && !current.me.admin)
        )
          return current;
        return { ...current, activity };
      });
    },
    [generation],
  );
  const shared = {
    data,
    mutate,
    busy,
    isSaving,
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
  if (loading) return <StarLoading />;
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
      <main className="login session-enter" aria-busy={busy}>
        {busy && (
          <StarLoading
            overlay
            message={
              registering
                ? "正在建立你的冒險者帳號…"
                : "正在登入，星光為你引路…"
            }
          />
        )}
        <div className="login-brand brand">
          <img
            className="brand-logo"
            src="/ddstar-logo-blue-v2.png"
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
    ["casino", "賭場", Compass],
    ...(SHOW_RAID_SCHEDULING ? [["raids", "出團排班", CalendarDays]] : []),
  ];
  return (
    <FormErrorContext.Provider value={error}>
      <div className="app">
        <aside className="sidebar">
          <div className="brand">
            <img
              className="brand-logo"
              src="/ddstar-logo-blue-v2.png"
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
              <button
                className={page === "settings" ? "active" : ""}
                aria-current={page === "settings" ? "page" : undefined}
                onClick={() => setPage("settings")}
              >
                <Settings size={19} />
                設定
              </button>
            </div>
            {data.me.admin && (
              <button
                className={page === "admin" ? "active" : ""}
                aria-current={page === "admin" ? "page" : undefined}
                aria-label="管理後台"
                onClick={() => setPage("admin")}
              >
                <ShieldCheck size={19} strokeWidth={1.7} />
                管理後台
              </button>
            )}
            <div className="user">
              <span className="avatar">
                {(data.me.nickname || data.me.username)[0]}
              </span>
              <div>
                {data.me.nickname || data.me.username}
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
                    characterSaves.flush();
                    await enqueueWrite(() => request("logout"));
                    authVersion.current++;
                    sessionMember.current = null;
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
            <small className="storage">edit by MrAirWolf</small>
          </div>
        </aside>
        <main className="main">
          <div key={`${data.me.id}/${page}`} className="view-transition">
            <Suspense fallback={<div className="loading">正在開啟頁面…</div>}>
              {page === "lobby" ? (
                <Lobby
                  data={data}
                  request={request}
                  onUnauthorized={onUnauthorized}
                  onActivityChange={onActivityChange}
                  mutate={mutate}
                  isSaving={isSaving}
                />
              ) : page === "settings" ? (
                <SettingsPanel
                  me={data.me}
                  mutate={mutate}
                  busy={busy}
                  isSaving={isSaving}
                  onTheme={() => setThemeOpen(true)}
                  onDiscord={() => setDiscordOpen(true)}
                  onTour={() => setTourOpen(true)}
                />
              ) : page === "casino" ? (
                <Casino
                  me={data.me}
                  request={request}
                  onUnauthorized={onUnauthorized}
                />
              ) : page === "characters" ? (
                <Characters
                  {...shared}
                  pendingChanges={characterSaves.pending}
                  change={characterSaves.change}
                />
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
      </div>
    </FormErrorContext.Provider>
  );
}
