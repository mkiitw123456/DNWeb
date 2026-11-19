const key = "ddstar-sound-v1";
const files = {
  choose: "/audio/adventure-select.ogg",
  reveal: "/audio/adventure-reveal.ogg",
  penalty: "/audio/adventure-setback.ogg",
};
const buffers = new Map();
let loadingSamples = false;
let settings = { enabled: true, volume: 0.22 },
  context,
  last = -Infinity,
  lastKind;
const sounds = {
  click: { notes: [620], length: 0.045 },
  success: { notes: [523, 659, 784] },
  error: { notes: [260, 196] },
  tick: { notes: [880] },
  coin: { notes: [1047, 1319, 1568, 2093] },
  choose: { notes: [392, 494], beat: 0.045, length: 0.07, wave: "triangle" },
  chooseExtra: { notes: [554, 831], beat: 0.055, length: 0.09 },
  reveal: { notes: [330, 494, 740, 988], beat: 0.055, length: 0.19 },
  steady: { notes: [392, 494, 587], beat: 0.08 },
  jackpot: {
    notes: [523, 659, 784, 1047],
    beat: 0.085,
    length: 0.23,
    wave: "triangle",
  },
  smallGain: { notes: [494, 440], beat: 0.12, length: 0.14 },
  unchanged: { notes: [392, 392], beat: 0.135, length: 0.09 },
  penalty: {
    notes: [330, 262, 196],
    beat: 0.115,
    length: 0.18,
    wave: "triangle",
  },
};
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
    if (!settings.enabled || !settings.volume) return;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    context ||= new Audio();
    if (!loadingSamples) {
      loadingSamples = true;
      for (const [kind, url] of Object.entries(files)) {
        fetch(url)
          .then(async (response) => {
            if (response.ok)
              buffers.set(
                kind,
                await context.decodeAudioData(await response.arrayBuffer()),
              );
          })
          .catch(() => {}); // The synthesized cue also works offline.
      }
    }
    if (context.state === "suspended") context.resume().catch(() => {});
  } catch {
    /* Audio is optional. */
  }
}
export function playSound(kind = "click") {
  if (
    !settings.enabled ||
    settings.volume <= 0 ||
    !context ||
    context.state !== "running" ||
    document.hidden
  )
    return;
  const now = context.currentTime;
  if (kind === lastKind && now - last < 0.07) return;
  lastKind = kind;
  last = now;
  const sample = buffers.get(kind);
  if (sample) {
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = sample;
    gain.gain.value = settings.volume * (kind === "penalty" ? 0.25 : 0.55);
    source.connect(gain);
    gain.connect(context.destination);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.start();
    return;
  }
  const {
    notes,
    length = 0.16,
    beat = 0.09,
    wave = "sine",
  } = sounds[kind] || sounds.click;
  notes.forEach((frequency, i) => {
    const oscillator = context.createOscillator(),
      gain = context.createGain();
    const start = now + i * beat;
    oscillator.type = wave;
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
