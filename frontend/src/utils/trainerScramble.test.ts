import { describe, it, expect } from 'vitest';
import { Alg } from 'cubing/alg';
import {
  generatePllScramble,
  PLL_CASES,
  PLL_CASE_MAP,
} from './trainerScramble';

const seededRng = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
};

describe('PLL_CASES', () => {
  it('contains 21 PLL cases', () => {
    expect(PLL_CASES).toHaveLength(21);
  });

  it('every case has at least one alg', () => {
    for (const c of PLL_CASES) {
      expect(c.algs.length).toBeGreaterThan(0);
      for (const alg of c.algs) {
        expect(() => new Alg(alg)).not.toThrow();
      }
    }
  });

  it('has unique case ids', () => {
    const ids = PLL_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('generatePllScramble', () => {
  it('produces a parseable alg string', () => {
    const { scramble } = generatePllScramble({ rng: seededRng(1) });
    expect(() => new Alg(scramble)).not.toThrow();
  });

  it('honors an explicit caseId', () => {
    const { caseId } = generatePllScramble({
      caseId: 'T',
      rng: seededRng(2),
    });
    expect(caseId).toBe('T');
  });

  it('honors an explicit algIndex', () => {
    const { caseId, algIndex } = generatePllScramble({
      caseId: 'H',
      algIndex: 1,
      rng: seededRng(3),
    });
    expect(caseId).toBe('H');
    expect(algIndex).toBe(1);
  });

  it('picks a random case from PLL_CASES when caseId is "all"', () => {
    const { caseId } = generatePllScramble({
      caseId: 'all',
      rng: seededRng(4),
    });
    expect(PLL_CASE_MAP[caseId]).toBeDefined();
  });

  it('picks a random alg within the case when algIndex is omitted', () => {
    const { caseId, algIndex } = generatePllScramble({
      caseId: 'Ua',
      rng: seededRng(5),
    });
    const c = PLL_CASE_MAP[caseId];
    expect(algIndex).toBeGreaterThanOrEqual(0);
    expect(algIndex).toBeLessThan(c.algs.length);
  });

  it('throws on unknown caseId', () => {
    expect(() =>
      generatePllScramble({ caseId: 'nope', rng: seededRng(6) })
    ).toThrow();
  });

  it('throws on out-of-range algIndex', () => {
    expect(() =>
      generatePllScramble({ caseId: 'T', algIndex: 99, rng: seededRng(7) })
    ).toThrow();
  });

  it('produces deterministic output for a given rng and case', () => {
    const a = generatePllScramble({ caseId: 'T', algIndex: 0, rng: seededRng(42) });
    const b = generatePllScramble({ caseId: 'T', algIndex: 0, rng: seededRng(42) });
    expect(a.scramble).toBe(b.scramble);
  });
});
