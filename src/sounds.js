const key = "ddstar-sound-v1";
let settings = { enabled: true, volume: 0.22 },
  context,
  last = 0;
try {
  const saved = JSON.parse(localStorage.getItem(key));
  if (
    saved &&
    typeof saved.enabled === "boolean" &&
    Number.isFinite(saved.volume)
  )
    settings = {
      enabled: saved.enabled,
      volume: Math.max(0, Math.min(1, saved.volume)),
    };
} catch {
  /* Storage may be disabled. */
}
export const soundSettings = () => ({ ...settings });
export function configureSound(next) {
  settings = { ...settings, ...next };
  try {
    localStorage.setItem(key, JSON.stringify(settings));
  } catch {
    /* Keep session preference. */
  }
}
export function unlockSound() {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    context ||= new Audio();
    if (context.state === "suspended") context.resume().catch(() => {});
  } catch {
    /* Audio is optional. */
  }
}
export function playSound(kind = "click") {
  if (
    !settings.enabled ||
    !context ||
    context.state !== "running" ||
    document.hidden
  )
    return;
  const now = context.currentTime;
  if (now - last < 0.07) return;
  last = now;
  const notes = {
    click: [620],
    success: [523, 659, 784],
    error: [260, 196],
    tick: [880],
    coin: [1047, 1319, 1568, 2093],
  }[kind] || [620];
  notes.forEach((frequency, i) => {
    const oscillator = context.createOscillator(),
      gain = context.createGain();
    const start = now + i * 0.09,
      length = kind === "click" ? 0.045 : 0.16;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(settings.volume * 0.18, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + length + 0.01);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  });
}
