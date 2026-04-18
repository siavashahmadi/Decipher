const SOLVES_KEY = (puzzleType) => `ao5_guest_solves_${puzzleType}`;
const MANIFEST_KEY = 'ao5_guest_puzzle_types';

function getManifest() {
  try {
    return JSON.parse(localStorage.getItem(MANIFEST_KEY) || '[]');
  } catch {
    return [];
  }
}

function addToManifest(puzzleType) {
  const manifest = getManifest();
  if (!manifest.includes(puzzleType)) {
    try {
      localStorage.setItem(MANIFEST_KEY, JSON.stringify([...manifest, puzzleType]));
    } catch {
      console.warn('ao5: could not update guest puzzle type manifest');
    }
  }
}

export function getGuestSolves(puzzleType) {
  try {
    return JSON.parse(localStorage.getItem(SOLVES_KEY(puzzleType)) || '[]');
  } catch {
    return [];
  }
}

export function saveGuestSolves(puzzleType, solves) {
  try {
    localStorage.setItem(SOLVES_KEY(puzzleType), JSON.stringify(solves));
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      console.warn('ao5: localStorage quota exceeded, solve not persisted');
    }
  }
}

export function addGuestSolve(puzzleType, solve) {
  const solves = getGuestSolves(puzzleType);
  saveGuestSolves(puzzleType, [solve, ...solves]);
  addToManifest(puzzleType);
}

export function updateGuestSolve(puzzleType, updatedSolve) {
  const solves = getGuestSolves(puzzleType);
  saveGuestSolves(
    puzzleType,
    solves.map((s) => (s.id === updatedSolve.id ? updatedSolve : s))
  );
}

export function deleteGuestSolve(puzzleType, solveId) {
  const solves = getGuestSolves(puzzleType);
  saveGuestSolves(
    puzzleType,
    solves.filter((s) => s.id !== solveId)
  );
}

export function getAllGuestSolves() {
  return getManifest().flatMap((pt) => getGuestSolves(pt));
}

export function clearAllGuestSolves() {
  const manifest = getManifest();
  manifest.forEach((pt) => localStorage.removeItem(SOLVES_KEY(pt)));
  localStorage.removeItem(MANIFEST_KEY);
}
