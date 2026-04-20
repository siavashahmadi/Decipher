import { Alg } from 'cubing/alg';
import pllData from '../data/pll.json';

export interface PllCase {
  id: string;
  name: string;
  algs: string[];
}

export const PLL_CASES: PllCase[] = pllData as PllCase[];

export const PLL_CASE_MAP: Record<string, PllCase> = Object.fromEntries(
  PLL_CASES.map((c) => [c.id, c])
);

const AUF_OPTIONS = ['', 'U', "U'", 'U2'] as const;
const Y_OPTIONS = ['', 'y', "y'", 'y2'] as const;

export interface TrainerScrambleOptions {
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

export function generatePllScramble(
  options: TrainerScrambleOptions = {}
): TrainerScrambleResult {
  const rng = options.rng ?? Math.random;

  const caseChoice = options.caseId && options.caseId !== 'all'
    ? PLL_CASE_MAP[options.caseId]
    : pick(PLL_CASES, rng);

  if (!caseChoice) {
    throw new Error(`Unknown PLL case: ${options.caseId}`);
  }

  const algIndex = options.algIndex !== undefined && options.algIndex >= 0
    ? options.algIndex
    : Math.floor(rng() * caseChoice.algs.length);

  const alg = caseChoice.algs[algIndex];
  if (!alg) {
    throw new Error(`Unknown alg index ${algIndex} for case ${caseChoice.id}`);
  }

  const inverse = new Alg(alg).invert().toString();
  const auf = pick(AUF_OPTIONS, rng);
  const yRot = pick(Y_OPTIONS, rng);

  return {
    scramble: joinTokens([auf, inverse, yRot]),
    caseId: caseChoice.id,
    algIndex,
  };
}
