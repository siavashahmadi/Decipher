import type { PuzzleType, Solve } from '../types';

// Guest solves live in localStorage and are read/written without any
// cross-tab coordination. If the same user has two tabs open and mutates
// solves in both, whichever save lands second will overwrite the first
// (last-writer-wins on the full per-puzzle array). This is an accepted
// limitation, not a TODO: guests are expected to be single-tab, and
// signed-in users write through the backend instead.
const SOLVES_KEY = (puzzleType: PuzzleType): string => `ao5_guest_solves_${puzzleType}`;
const MANIFEST_KEY = 'ao5_guest_puzzle_types';

function getManifest(): PuzzleType[] {
  try {
    return JSON.parse(localStorage.getItem(MANIFEST_KEY) || '[]') as PuzzleType[];
  } catch {
    return [];
  }
}

function addToManifest(puzzleType: PuzzleType): void {
  const manifest = getManifest();
  if (!manifest.includes(puzzleType)) {
    try {
      localStorage.setItem(MANIFEST_KEY, JSON.stringify([...manifest, puzzleType]));
    } catch {
      console.warn('ao5: could not update guest puzzle type manifest');
    }
  }
}

export function getGuestSolves(puzzleType: PuzzleType): Solve[] {
  try {
    return JSON.parse(localStorage.getItem(SOLVES_KEY(puzzleType)) || '[]') as Solve[];
  } catch {
    return [];
  }
}

export class GuestStorageQuotaError extends Error {
  constructor() {
    super('ao5: localStorage quota exceeded, solve not persisted');
    this.name = 'GuestStorageQuotaError';
  }
}

export function saveGuestSolves(puzzleType: PuzzleType, solves: Solve[]): void {
  try {
    localStorage.setItem(SOLVES_KEY(puzzleType), JSON.stringify(solves));
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      throw new GuestStorageQuotaError();
    }
    throw e;
  }
}

export function addGuestSolve(puzzleType: PuzzleType, solve: Solve): void {
  const solves = getGuestSolves(puzzleType);
  saveGuestSolves(puzzleType, [solve, ...solves]);
  addToManifest(puzzleType);
}

export function updateGuestSolve(puzzleType: PuzzleType, updatedSolve: Solve): void {
  const solves = getGuestSolves(puzzleType);
  saveGuestSolves(
    puzzleType,
    solves.map((s) => (s.id === updatedSolve.id ? updatedSolve : s))
  );
}

export function deleteGuestSolve(puzzleType: PuzzleType, solveId: string): void {
  const solves = getGuestSolves(puzzleType);
  saveGuestSolves(
    puzzleType,
    solves.filter((s) => s.id !== solveId)
  );
}

export function getAllGuestSolves(): Solve[] {
  return getManifest().flatMap((pt) => getGuestSolves(pt));
}

export function removeGuestSolves(solves: Solve[]): void {
  if (solves.length === 0) return;
  const idsToRemove = new Set(solves.map((s) => s.id));
  const manifest = getManifest();
  const remaining: PuzzleType[] = [];
  for (const pt of manifest) {
    const current = getGuestSolves(pt);
    const filtered = current.filter((s) => !idsToRemove.has(s.id));
    if (filtered.length === 0) {
      localStorage.removeItem(SOLVES_KEY(pt));
    } else {
      saveGuestSolves(pt, filtered);
      remaining.push(pt);
    }
  }
  try {
    localStorage.setItem(MANIFEST_KEY, JSON.stringify(remaining));
  } catch {
    console.warn('ao5: could not update guest puzzle type manifest');
  }
}
