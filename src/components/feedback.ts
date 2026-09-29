/** Sound, vibration and screen wake lock for the scanner and pass screens. */
import type { Tone } from "@/lib/verify";

let audio: AudioContext | null = null;

/** Must be called from a tap (browsers only allow audio after a user gesture). */
export function unlockAudio() {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
  } catch {
    audio = null;
  }
}

const PATTERNS: Record<Tone, { freq: number; at: number; length: number }[]> = {
  ok: [
    { freq: 880, at: 0, length: 0.09 },
    { freq: 1320, at: 0.1, length: 0.14 },
  ],
  warn: [
    { freq: 660, at: 0, length: 0.12 },
    { freq: 660, at: 0.2, length: 0.12 },
  ],
  bad: [{ freq: 196, at: 0, length: 0.4 }],
};

const VIBRATION: Record<Tone, number[]> = { ok: [60], warn: [80, 60, 80], bad: [320] };

export function signal(tone: Tone, sound: boolean) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(VIBRATION[tone]);
  if (!sound || !audio) return;
  const start = audio.currentTime;
  for (const note of PATTERNS[tone]) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = tone === "bad" ? "square" : "sine";
    osc.frequency.value = note.freq;
    gain.gain.setValueAtTime(0.0001, start + note.at);
    gain.gain.exponentialRampToValueAtTime(tone === "bad" ? 0.12 : 0.25, start + note.at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + note.at + note.length);
    osc.connect(gain).connect(audio.destination);
    osc.start(start + note.at);
    osc.stop(start + note.at + note.length + 0.02);
  }
}

/** Keeps the screen on while scanning / showing a pass. Returns a release function. */
export function keepScreenOn(): () => void {
  let lock: WakeLockSentinel | null = null;
  let released = false;
  const request = async () => {
    try {
      if ("wakeLock" in navigator && document.visibilityState === "visible") {
        lock = await navigator.wakeLock.request("screen");
      }
    } catch {
      // Not supported or denied (e.g. battery saver). Nothing else to do.
    }
  };
  const onVisible = () => {
    if (!released && document.visibilityState === "visible") void request();
  };
  void request();
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    released = true;
    document.removeEventListener("visibilitychange", onVisible);
    void lock?.release().catch(() => undefined);
  };
}
