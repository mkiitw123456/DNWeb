import { useSyncExternalStore } from "react";

const options = [
  ["aquarium", "潮汐水族箱"],
  ["sky", "山頂觀星台"],
  ["simple", "簡約簽到"],
];
const fallback = new Map();
const changeEvent = "ddstar-lobby-scenery-change";

function subscribe(listener) {
  window.addEventListener(changeEvent, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(changeEvent, listener);
    window.removeEventListener("storage", listener);
  };
}

export function useLobbyScenery(memberId) {
  const key = "ddstar.lobby-scenery.v1/" + memberId;
  const read = () => {
    let value = fallback.get(key);
    if (!value) {
      try { value = localStorage.getItem(key); } catch { /* Private storage may be unavailable. */ }
    }
    return options.some(([id]) => id === value) ? value : "aquarium";
  };
  const scene = useSyncExternalStore(subscribe, read);
  function choose(value) {
    try {
      localStorage.setItem(key, value);
      fallback.delete(key);
    } catch {
      fallback.set(key, value);
    }
    window.dispatchEvent(new Event(changeEvent));
  }
  return [scene, choose];
}

export function ScenerySelect({ value, onChange }) {
  return <select aria-label="大廳佈景" value={value} onChange={e => onChange(e.target.value)}>
    {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
  </select>;
}
