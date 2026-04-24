// Inspection tones. Start beep marks inspection entry; first warning at 8s
// (7s remaining); second warning at 12s (3s remaining).
export const INSPECTION_START_HZ = 880;
export const INSPECTION_START_MS = 80;
export const INSPECTION_8S_WARNING_HZ = 440;
export const INSPECTION_8S_WARNING_MS = 100;
export const INSPECTION_12S_WARNING_HZ = 660;
export const INSPECTION_12S_WARNING_MS = 150;

let audioCtx: AudioContext | null = null;
let soundEnabled = false;

const getCtx = (): AudioContext | null => {
  if (audioCtx) return audioCtx;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    return audioCtx;
  } catch {
    return null;
  }
};

export const setSoundEnabled = (enabled: boolean): void => {
  soundEnabled = enabled;
};

export const isSoundEnabled = (): boolean => soundEnabled;

export const beep = (freq: number, durationMs: number): void => {
  if (!soundEnabled) return;
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const now = ctx.currentTime;
    const dur = durationMs / 1000;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.01);
    gain.gain.linearRampToValueAtTime(0.1, now + dur - 0.02);
    gain.gain.linearRampToValueAtTime(0, now + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur);
  } catch {
    // ignore; audio failure must never break the timer
  }
};
