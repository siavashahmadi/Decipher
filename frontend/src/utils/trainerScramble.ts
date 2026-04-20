import { Alg } from 'cubing/alg';
import pllData from '../data/pll.json';
import ollData from '../data/oll.json';
import f2lData from '../data/f2l.json';

export type TrainerType = 'pll' | 'oll' | 'f2l';

export interface TrainerCase {
  id: string;
  name: string;
  group?: string;
  algs: string[];
}

export const PLL_CASES: TrainerCase[] = pllData as TrainerCase[];
export const OLL_CASES: TrainerCase[] = ollData as TrainerCase[];
export const F2L_CASES: TrainerCase[] = f2lData as TrainerCase[];

const caseMap = (cases: TrainerCase[]): Record<string, TrainerCase> =>
  Object.fromEntries(cases.map((c) => [c.id, c]));

export const PLL_CASE_MAP: Record<string, TrainerCase> = caseMap(PLL_CASES);
export const OLL_CASE_MAP: Record<string, TrainerCase> = caseMap(OLL_CASES);
export const F2L_CASE_MAP: Record<string, TrainerCase> = caseMap(F2L_CASES);

export const CASES_BY_TYPE: Record<TrainerType, TrainerCase[]> = {
  pll: PLL_CASES,
  oll: OLL_CASES,
  f2l: F2L_CASES,
};

export const CASE_MAP_BY_TYPE: Record<TrainerType, Record<string, TrainerCase>> = {
  pll: PLL_CASE_MAP,
  oll: OLL_CASE_MAP,
  f2l: F2L_CASE_MAP,
};

const AUF_OPTIONS = ['', 'U', "U'", 'U2'] as const;
const Y_OPTIONS = ['', 'y', "y'", 'y2'] as const;

export interface TrainerScrambleOptions {
  type: TrainerType;
  caseId?: string | 'all';
  algIndex?: number;
  rng?: () => number;
}

export interface TrainerScrambleResult {
  scramble: string;
  caseId: string;
  algIndex: number;
}

const pick = <T,>(arr: readonly T[], rng: () => number): T =>
  arr[Math.floor(rng() * arr.length)];

const joinTokens = (tokens: string[]): string =>
  tokens.filter((t) => t.length > 0).join(' ');

export function generateTrainerScramble(
  options: TrainerScrambleOptions
): TrainerScrambleResult {
  const { type } = options;
  const rng = options.rng ?? Math.random;
  const cases = CASES_BY_TYPE[type];
  const map = CASE_MAP_BY_TYPE[type];

  const caseChoice = options.caseId && options.caseId !== 'all'
    ? map[options.caseId]
    : pick(cases, rng);

  if (!caseChoice) {
    throw new Error(`Unknown ${type} case: ${options.caseId}`);
  }

  const algIndex = options.algIndex !== undefined && options.algIndex >= 0
    ? options.algIndex
    : Math.floor(rng() * caseChoice.algs.length);

  const alg = caseChoice.algs[algIndex];
  if (!alg) {
    throw new Error(`Unknown alg index ${algIndex} for ${type} case ${caseChoice.id}`);
  }

  const inverse = new Alg(alg).invert().toString();
  const auf = pick(AUF_OPTIONS, rng);
  const yRot = pick(Y_OPTIONS, rng);

  // Y-rotation must go first so applying `alg` to the scramble cleanly
  // round-trips: y AUF inverse(alg) · alg = y AUF (solved modulo orientation).
  // For F2L, the y-rotation also rotates the unsolved slot to one of the
  // four positions. For PLL/OLL it's purely for angle variety.
  const scramble = joinTokens([yRot, auf, inverse]);

  return {
    scramble,
    caseId: caseChoice.id,
    algIndex,
  };
}

// Phase 8 compatibility shim. Prefer generateTrainerScramble in new code.
export function generatePllScramble(
  options: Omit<TrainerScrambleOptions, 'type'> = {}
): TrainerScrambleResult {
  return generateTrainerScramble({ ...options, type: 'pll' });
}
