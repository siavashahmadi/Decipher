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
 * consumers can call a single method regardless of auth state. Binding
 * puzzleType into the store at construction keeps the API/guest split from
 * leaking through per-call parameters.
 */
export interface SolveStore {
  fetchPage: (cursor?: string | null) => Promise<SolvesPage>;
  create: (payload: SolvePayload) => Promise<Solve>;
  update: (solve: Solve) => Promise<void>;
  remove: (solveId: string) => Promise<void>;
}

const makeGuestStore = (puzzleType: PuzzleType): SolveStore => ({
  fetchPage: async () => ({
    solves: getGuestSolves(puzzleType),
    next_cursor: null,
  }),
  create: async (payload) => {
    const solve: Solve = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      ...payload,
    };
    addGuestSolve(puzzleType, solve);
    return solve;
  },
  update: async (solve) => {
    updateGuestSolve(puzzleType, solve);
  },
  remove: async (solveId) => {
    deleteGuestSolve(puzzleType, solveId);
  },
});

const makeApiStore = (puzzleType: PuzzleType): SolveStore => ({
  fetchPage: cursor => api.getSolves(puzzleType, cursor ?? null),
  create: api.createSolve,
  update: solve => api.updateSolve(solve.id, solve).then(() => undefined),
  remove: id => api.deleteSolve(id),
});

const useSolveStore = (isGuest: boolean, puzzleType: PuzzleType): SolveStore => {
  return useMemo(
    () => (isGuest ? makeGuestStore(puzzleType) : makeApiStore(puzzleType)),
    [isGuest, puzzleType],
  );
};

export default useSolveStore;
