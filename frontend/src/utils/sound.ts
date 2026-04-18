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
