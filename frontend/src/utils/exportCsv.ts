import type { Solve } from '../types';

const HEADER = ['Time', 'Comment', 'Scramble', 'Date', 'P.1', 'P.2'];

const DANGEROUS_PREFIXES = /^[=+\-@\t\r]/;
const quote = (v: string): string => {
  const safe = DANGEROUS_PREFIXES.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
};

const timeField = (s: Solve): string => {
  const ms = Math.round(s.time * 1000);
  const penalty = s.dnf ? -1 : s.plus_two ? 2000 : 0;
  return `[${penalty}, ${ms}]`;
};

export function buildCsv(solves: Solve[]): string {
  const rows: string[] = [HEADER.map(quote).join(',')];
  for (const s of solves) {
    const date = new Date(s.created_at).getTime();
    rows.push([
      quote(timeField(s)),
      quote(''),
      quote(s.scramble ?? ''),
      quote(String(Number.isFinite(date) ? date : 0)),
      quote(''),
      quote(''),
    ].join(','));
  }
  return rows.join('\r\n') + '\r\n';
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
