import { describe, it, expect } from 'vitest';
import { Alg } from 'cubing/alg';
import { cube3x3x3 } from 'cubing/puzzles';
import {
  generateTrainerScramble,
  generatePllScramble,
  validateTrainerCases,
  PLL_CASES,
  OLL_CASES,
  F2L_CASES,
  PLL_CASE_MAP,
  CASES_BY_TYPE,
  type TrainerType,
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

  it('every case has at least one alg and all parse', () => {
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

describe('OLL_CASES', () => {
  it('contains 57 OLL cases', () => {
    expect(OLL_CASES).toHaveLength(57);
  });

  it('every case has at least one alg and all parse', () => {
    for (const c of OLL_CASES) {
      expect(c.algs.length).toBeGreaterThan(0);
      for (const alg of c.algs) {
        expect(() => new Alg(alg)).not.toThrow();
      }
    }
  });

  it('has unique case ids', () => {
    const ids = OLL_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('F2L_CASES', () => {
  it('contains 41 F2L cases', () => {
    expect(F2L_CASES).toHaveLength(41);
  });

  it('every case has at least one alg and all parse', () => {
    for (const c of F2L_CASES) {
      expect(c.algs.length).toBeGreaterThan(0);
      for (const alg of c.algs) {
        expect(() => new Alg(alg)).not.toThrow();
      }
    }
  });

  it('has unique case ids', () => {
    const ids = F2L_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('generatePllScramble (Phase 8 shim)', () => {
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

  it('picks a random case from PLL_CASES when caseId is "all"', () => {
    const { caseId } = generatePllScramble({
      caseId: 'all',
      rng: seededRng(4),
    });
    expect(PLL_CASE_MAP[caseId]).toBeDefined();
  });

  it('throws on unknown caseId', () => {
    expect(() =>
      generatePllScramble({ caseId: 'nope', rng: seededRng(6) })
    ).toThrow();
  });
});

describe('generateTrainerScramble dispatcher', () => {
  it('routes by type', () => {
    const a = generateTrainerScramble({ type: 'pll', caseId: 'T', algIndex: 0, rng: seededRng(1) });
    expect(a.caseId).toBe('T');

    const b = generateTrainerScramble({ type: 'oll', caseId: '27', algIndex: 0, rng: seededRng(1) });
    expect(b.caseId).toBe('27');
  });

  it('produces parseable output for every type', () => {
    for (const type of ['pll', 'oll'] as TrainerType[]) {
      for (let i = 0; i < 5; i += 1) {
        const { scramble } = generateTrainerScramble({ type, caseId: 'all', rng: seededRng(i + 1) });
        expect(() => new Alg(scramble)).not.toThrow();
      }
    }
  });
});

// Alg-correctness: applying `alg` to the generated scramble returns the cube
// to a solved state (ignoring whole-cube orientation). Catches curation typos.
describe('alg correctness', () => {
  const types: TrainerType[] = ['pll', 'oll', 'f2l'];

  for (const type of types) {
    const cases = CASES_BY_TYPE[type];
    for (const c of cases) {
      for (let algIndex = 0; algIndex < c.algs.length; algIndex += 1) {
        it(`${type} ${c.id} alg #${algIndex + 1} solves the scramble`, async () => {
          const kpuzzle = await cube3x3x3.kpuzzle();
          // rng=0 forces empty AUF + empty y-rotation so scramble = inverse(alg).
          // This isolates alg correctness from randomization behavior.
          const { scramble } = generateTrainerScramble({
            type,
            caseId: c.id,
            algIndex,
            rng: () => 0,
          });
          const combined = new Alg(`${scramble} ${c.algs[algIndex]}`);
          const result = kpuzzle.defaultPattern().applyAlg(combined);
          expect(
            result.experimentalIsSolved({
              ignorePuzzleOrientation: true,
              ignoreCenterOrientation: true,
            })
          ).toBe(true);
        });
      }
    }
  }
});

describe('validateTrainerCases', () => {
  it('throws on non-array input', () => {
    expect(() => validateTrainerCases({}, 'test')).toThrow('not an array');
  });

  it('throws on missing algs array', () => {
    expect(() => validateTrainerCases([{ id: 'x', name: 'X' }], 'test'))
      .toThrow('empty algs');
  });

  it('throws on empty string alg', () => {
    expect(() => validateTrainerCases([{ id: 'x', name: 'X', algs: [''] }], 'test'))
      .toThrow('non-string or empty alg');
  });

  it('throws on missing id', () => {
    expect(() => validateTrainerCases([{ name: 'X', algs: ['R U'] }], 'test'))
      .toThrow('missing id');
  });

  it('accepts a well-formed case array', () => {
    const cases = [{ id: 'a', name: 'A', algs: ['R U R\''] }];
    expect(validateTrainerCases(cases, 'test')).toBe(cases);
  });
});
