import { useMemo } from 'react';
import api, { type SolvePayload, type SolvesPage } from '../services/api';
import {
  getGuestSolves,
  addGuestSolve,
  updateGuestSolve,
  deleteGuestSolve,
} from '../services/guestStorage';
import type { PuzzleType, Solve } from '../types';

/**
 * Unifies the guest (localStorage) and authenticated (API) solve IO paths so
 * SolveSession can call a single method regardless of auth state. Without
 * this, every mutation had parallel if/else branches at four call sites.
 *
 * The guest side is synchronous under the hood but presents the same
 * Promise-returning surface as the API so callers don't branch on timing.
 */
export interface SolveStore {
  fetchPage: (puzzleType: PuzzleType, cursor?: string | null) => Promise<SolvesPage>;
  create: (puzzleType: PuzzleType, payload: SolvePayload) => Promise<Solve>;
  update: (puzzleType: PuzzleType, solve: Solve) => Promise<void>;
  remove: (puzzleType: PuzzleType, solveId: string) => Promise<void>;
}

const makeGuestStore = (): SolveStore => ({
  fetchPage: async (puzzleType) => ({
    solves: getGuestSolves(puzzleType),
    next_cursor: null,
  }),
  create: async (puzzleType, payload) => {
    const solve: Solve = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      ...payload,
    };
    addGuestSolve(puzzleType, solve);
    return solve;
  },
  update: async (puzzleType, solve) => {
    updateGuestSolve(puzzleType, solve);
  },
  remove: async (puzzleType, solveId) => {
    deleteGuestSolve(puzzleType, solveId);
  },
});

const makeApiStore = (): SolveStore => ({
  fetchPage: (puzzleType, cursor = null) => api.getSolves(puzzleType, cursor),
  create: async (_puzzleType, payload) => api.createSolve(payload),
  update: async (_puzzleType, solve) => {
    await api.updateSolve(solve.id, solve);
  },
  remove: async (_puzzleType, solveId) => {
    await api.deleteSolve(solveId);
  },
});

const useSolveStore = (isGuest: boolean): SolveStore => {
  return useMemo(() => (isGuest ? makeGuestStore() : makeApiStore()), [isGuest]);
};

export default useSolveStore;
