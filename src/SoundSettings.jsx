import { useState } from "react";
import {
  soundSettings,
  configureSound,
  playSound,
  unlockSound,
} from "./sounds.js";
export default function SoundSettings() {
  const [value, setValue] = useState(soundSettings);
  function update(next) {
    const merged = { ...value, ...next };
    setValue(merged);
    configureSound(merged);
  }
  return (
    <fieldset className="sound-settings">
      <legend>音效</legend>
      <label>
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
        />
        啟用操作音效
      </label>
      <label>
        音量 {Math.round(value.volume * 100)}%
        <input
          aria-label="音效音量"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={value.volume}
          onChange={(e) => update({ volume: Number(e.target.value) })}
        />
      </label>
      <button
        type="button"
        disabled={!value.enabled}
        onClick={() => {
          unlockSound();
          playSound("success");
        }}
      >
        試聽音效
      </button>
      <small>只保存在這台瀏覽器，不播放背景音樂。</small>
    </fieldset>
  );
}
