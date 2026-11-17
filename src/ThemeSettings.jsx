import { notify } from "./FeedbackHost.jsx";
import { useEffect, useState } from "react";
import { Button, Field, Modal } from "./ui.jsx";
export const themeDefaults = {
  background: "#14151a",
  surface: "#1b1c23",
  sidebar: "#101115",
  border: "#30313c",
  accent: "#8b7cf8",
  gradient: false,
  gradientEnd: "#29233d",
  angle: 135,
};
const presets = {
  經典紫: themeDefaults,
  深海: {
    ...themeDefaults,
    background: "#101b25",
    surface: "#182b39",
    sidebar: "#0b141c",
    border: "#365063",
    accent: "#83b8d6",
    gradientEnd: "#263c56",
  },
  暖紙: {
    ...themeDefaults,
    background: "#eee9df",
    surface: "#faf6ed",
    sidebar: "#e2dccf",
    border: "#b9ad99",
    accent: "#805b3b",
    gradientEnd: "#ded4c1",
  },
};
const validHex = (x) => /^#[0-9a-f]{6}$/i.test(x || "");
export function normalizeTheme(value = {}) {
  const out = { ...themeDefaults };
  for (const k of [
    "background",
    "surface",
    "sidebar",
    "border",
    "accent",
    "gradientEnd",
  ])
    if (validHex(value[k])) out[k] = value[k];
  out.gradient = value.gradient === true;
  out.angle = Number.isFinite(Number(value.angle))
    ? Math.max(0, Math.min(360, Number(value.angle)))
    : 135;
  return out;
}
function light(hex) {
  const c = hex
    .slice(1)
    .match(/../g)
    .map((x) => parseInt(x, 16) / 255)
    .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722 > 0.35;
}
export function applyTheme(value) {
  const t = normalizeTheme(value),
    root = document.documentElement;
  const vars = {
    canvas: t.background,
    surface: t.surface,
    sidebar: t.sidebar,
    border: t.border,
    accent: t.accent,
    "accent-soft": t.accent + "20",
    hover: t.accent + "18",
    text: light(t.background) ? "#202523" : "#ececf2",
    muted: light(t.background) ? "#575f59" : "#a0a2b0",
    "button-text": light(t.accent) ? "#101714" : "#ffffff",
    "page-background": t.gradient
      ? `linear-gradient(${t.angle}deg,${t.background},${t.gradientEnd})`
      : t.background,
  };
  for (const [k, v] of Object.entries(vars))
    root.style.setProperty("--" + k, v);
  root.style.colorScheme = light(t.background) ? "light" : "dark";
}
export function loadTheme(uid) {
  try {
    return normalizeTheme(
      JSON.parse(localStorage.getItem(`dnweb-theme-v1:${uid}`) || "{}"),
    );
  } catch {
    return { ...themeDefaults };
  }
}
export default function ThemeSettings({ userId, onClose }) {
  const [theme, setTheme] = useState(() => loadTheme(userId)),
    [message, setMessage] = useState("");
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  const change = (key, value) => {
    setTheme((t) => ({ ...t, [key]: value }));
    setMessage("");
  };
  return (
    <Modal
      title="外觀設定"
      onClose={() => {
        applyTheme(loadTheme(userId));
        onClose();
      }}
    >
      <p className="muted">
        配色只儲存在這台瀏覽器，不寫入 Firebase。清除網站資料後會恢復預設。
      </p>
      <div className="theme-presets">
        {Object.entries(presets).map(([name, t]) => (
          <Button
            key={name}
            onClick={() => {
              setTheme({ ...t });
              setMessage("");
            }}
          >
            {name}
          </Button>
        ))}
      </div>
      <div className="theme-grid">
        {[
          ["background", "背景"],
          ["surface", "卡片背景"],
          ["sidebar", "側欄"],
          ["border", "外框"],
          ["accent", "按鈕與重點色"],
          ["gradientEnd", "漸層終點"],
        ].map(([key, label]) => (
          <Field
            key={key}
            label={label}
            type="color"
            value={theme[key]}
            onChange={(e) => change(key, e.target.value)}
          />
        ))}
      </div>
      <label className="switch-row">
        背景使用漸層
        <input
          type="checkbox"
          checked={theme.gradient}
          onChange={(e) => change("gradient", e.target.checked)}
        />
      </label>
      {theme.gradient && (
        <Field
          label={`漸層方向 ${theme.angle}°`}
          type="range"
          min="0"
          max="360"
          value={theme.angle}
          onChange={(e) => change("angle", Number(e.target.value))}
        />
      )}
      <div className="form-actions">
        <Button onClick={() => setTheme({ ...themeDefaults })}>
          恢復預設配色
        </Button>
        <Button
          primary
          onClick={() => {
            try {
              localStorage.setItem(
                `dnweb-theme-v1:${userId}`,
                JSON.stringify(theme),
              );
              setMessage("配色已儲存在這台瀏覽器。");
              notify("配色已儲存在這台瀏覽器。");
            } catch {
              setMessage("瀏覽器不允許儲存，配色僅在本次使用生效。");
              notify("瀏覽器不允許儲存，配色僅在本次使用生效。", "error");
            }
          }}
        >
          儲存配色
        </Button>
      </div>
      {message && <p role="status">{message}</p>}
    </Modal>
  );
}
