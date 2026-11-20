import { createContext, useContext, useEffect, useRef, useState } from "react";

const playlists = {
  aquarium: [
    { title: "玻璃水紋", url: "/audio/aquarium-glass.mp3" },
    { title: "潮間慢舞", url: "/audio/aquarium-tide.mp3" },
    { title: "深藍晚燈", url: "/audio/aquarium-dusk.mp3" },
  ],
};
const key = "ddstar-theme-music";
const MusicContext = createContext(null);

function preferences() {
  let value;
  try { value = JSON.parse(localStorage.getItem(key)); } catch { /* Use defaults. */ }
  return {
    enabled: value?.enabled === true,
    volume: Math.min(1, Math.max(0, Number.isFinite(value?.volume) ? value.volume : 0.22)),
  };
}

export function ThemeMusic({ theme, children }) {
  const [prefs, setPrefs] = useState(preferences);
  const [index, setIndex] = useState(0);
  const [message, setMessage] = useState("");
  const audio = useRef(null);
  const list = playlists[theme];
  const track = list?.[index % list.length];
  function update(patch) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* Session-only preference. */ }
  }
  useEffect(() => { audio.current.volume = prefs.volume; }, [prefs.volume]);
  useEffect(() => {
    const player = audio.current;
    if (!prefs.enabled || !track) { setMessage(""); return; }
    let active = true;
    player.src = track.url;
    function start() {
      if (!player.paused) return;
      player.play().then(() => { if (active) setMessage(""); }).catch(error => {
        if (!active || error.name === "AbortError") return;
        setMessage(error.name === "NotAllowedError" ? "點一下頁面即可開始播放" : "音樂載入失敗，請切換曲目或重新開啟。");
      });
    }
    start();
    window.addEventListener("click", start);
    window.addEventListener("keydown", start);
    return () => {
      active = false;
      window.removeEventListener("click", start);
      window.removeEventListener("keydown", start);
      player.pause();
      player.removeAttribute("src");
      player.load();
    };
  }, [prefs.enabled, track]);
  return <MusicContext.Provider value={{ prefs, update, list, index, setIndex, message }}>
    <audio ref={audio} preload="none" onEnded={() => setIndex(i => (i + 1) % list.length)} />
    {children}
  </MusicContext.Provider>;
}

export function MusicSettings() {
  const { prefs, update, list, index, setIndex, message } = useContext(MusicContext);
  if (!list) return null;
  return <fieldset className="sound-settings">
    <legend>主題背景音樂</legend>
    <label><input type="checkbox" checked={prefs.enabled} onChange={e => update({enabled:e.target.checked})}/>播放背景音樂</label>
    <label>水族箱曲目<select value={index % list.length} onChange={e => setIndex(Number(e.target.value))}>
      {list.map((t,i) => <option value={i} key={t.url}>{t.title}</option>)}
    </select></label>
    <label>音量 {Math.round(prefs.volume * 100)}%<input aria-label="背景音樂音量" type="range" min="0" max="1" step="0.01" value={prefs.volume} onChange={e => update({volume:Number(e.target.value)})}/></label>
    <small>{message || "依主題輪播，音量與開關儲存在這台瀏覽器。"}</small>
  </fieldset>;
}
