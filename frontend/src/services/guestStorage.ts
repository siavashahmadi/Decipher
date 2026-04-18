import type { PuzzleType, Solve } from '../types';

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

export function saveGuestSolves(puzzleType: PuzzleType, solves: Solve[]): void {
  try {
    localStorage.setItem(SOLVES_KEY(puzzleType), JSON.stringify(solves));
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      console.warn('ao5: localStorage quota exceeded, solve not persisted');
    }
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

export function clearAllGuestSolves(): void {
  const manifest = getManifest();
  manifest.forEach((pt) => localStorage.removeItem(SOLVES_KEY(pt)));
  localStorage.removeItem(MANIFEST_KEY);
}
