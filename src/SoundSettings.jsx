import { useState } from "react";
import {
  soundSettings,
  configureSound,
  playSound,
  unlockSound,
} from "./sounds.js";
export default function SoundSettings() {
  const [value, setValue] = useState(soundSettings);
  const [preview, setPreview] = useState("reveal");
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
      <label>
        試聽項目
        <select value={preview} onChange={(e) => setPreview(e.target.value)}>
          <option value="choose">選擇行動</option>
          <option value="reveal">發現機遇</option>
          <option value="chooseExtra">選擇機遇</option>
          <option value="steady">一般獎勵</option>
          <option value="jackpot">高額獎勵</option>
          <option value="smallGain">較低獎勵</option>
          <option value="unchanged">星數持平</option>
          <option value="penalty">扣除星星</option>
        </select>
      </label>
      <button
        type="button"
        data-own-sound
        disabled={!value.enabled}
        onClick={() => {
          unlockSound();
          playSound(preview);
        }}
      >
        試聽音效
      </button>
      <small>操作音效設定只保存在這台瀏覽器。</small>
    </fieldset>
  );
}
