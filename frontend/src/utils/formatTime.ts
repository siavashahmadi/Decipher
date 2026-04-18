export interface FormatTimeOptions {
  showSign?: boolean;
}

export function formatTime(seconds: number, opts?: FormatTimeOptions): string {
  if (!Number.isFinite(seconds)) return '-';
  if (seconds < 0 && !opts?.showSign) return '-';

  const abs = Math.abs(seconds);
  const cs = Math.round(abs * 100);
  const totalSeconds = Math.floor(cs / 100);
  const centis = cs % 100;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  const pad = (n: number): string => String(n).padStart(2, '0');
  const centisStr = pad(centis);

  let sign = '';
  if (opts?.showSign) {
    if (seconds < 0) sign = '-';
    else if (seconds > 0) sign = '+';
  }

  if (hours > 0) return `${sign}${hours}:${pad(minutes)}:${pad(secs)}.${centisStr}`;
  if (minutes > 0) return `${sign}${minutes}:${pad(secs)}.${centisStr}`;
  return `${sign}${secs}.${centisStr}`;
}
