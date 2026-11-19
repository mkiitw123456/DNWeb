import { useEffect } from "react";
import { unlockSound, playSound } from "./sounds.js";
export default function SoundHost() {
  useEffect(() => {
    const unlock = () => unlockSound();
    const click = (e) => {
      const target = e.target.closest?.("button:not(:disabled), a[href]");
      if (target && !target.hasAttribute("data-own-sound")) playSound("click");
    };
    const notice = (e) =>
      playSound(e.detail.kind === "error" ? "error" : "success");
    const save = (e) => {
      if (e.detail.state !== "pending")
        playSound(e.detail.state === "error" ? "error" : "success");
    };
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    document.addEventListener("click", click);
    window.addEventListener("ddstar-notice", notice);
    window.addEventListener("ddstar-save", save);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
      document.removeEventListener("click", click);
      window.removeEventListener("ddstar-notice", notice);
      window.removeEventListener("ddstar-save", save);
    };
  }, []);
  return null;
}
