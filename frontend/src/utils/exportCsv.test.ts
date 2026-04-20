import { describe, it, expect } from 'vitest';
import { buildCsv } from './exportCsv';
import type { Solve } from '../types';

const mk = (p: Partial<Solve>): Solve => ({
  id: 'x', puzzle_type: '333', time: 12.34, dnf: false, plus_two: false,
  scramble: "R U R'", created_at: '2026-01-01T00:00:00.000Z', ...p,
});

describe('buildCsv', () => {
  it('emits header row exactly', () => {
    const csv = buildCsv([]);
    expect(csv).toBe('"Time","Comment","Scramble","Date","P.1","P.2"\r\n');
  });

  it('formats a clean solve', () => {
    const csv = buildCsv([mk({ time: 12.34 })]);
    const lines = csv.split('\r\n');
    expect(lines[1]).toBe(
      `"[0, 12340]","","R U R'","${new Date('2026-01-01T00:00:00.000Z').getTime()}","",""`,
    );
  });

  it('encodes +2 as penalty 2000', () => {
    const csv = buildCsv([mk({ time: 10, plus_two: true })]);
    expect(csv).toContain('"[2000, 10000]"');
  });

  it('encodes DNF as penalty -1', () => {
    const csv = buildCsv([mk({ time: 8.5, dnf: true })]);
    expect(csv).toContain('"[-1, 8500]"');
  });

  it('escapes inner quotes in scramble', () => {
    const csv = buildCsv([mk({ scramble: 'A "B" C' })]);
    expect(csv).toContain('"A ""B"" C"');
  });

  it('preserves solve order (newest first as given)', () => {
    const a = mk({ id: 'a', time: 1, created_at: '2026-01-02T00:00:00.000Z' });
    const b = mk({ id: 'b', time: 2, created_at: '2026-01-01T00:00:00.000Z' });
    const csv = buildCsv([a, b]);
    const lines = csv.trim().split('\r\n');
    expect(lines[1]).toContain('[0, 1000]');
    expect(lines[2]).toContain('[0, 2000]');
  });
});
