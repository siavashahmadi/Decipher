import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getGuestSolves,
  saveGuestSolves,
  addGuestSolve,
  getAllGuestSolves,
  removeGuestSolves,
  GuestStorageQuotaError,
} from './guestStorage';
import { makeSolve } from '../test-utils/makeSolve';

const MANIFEST_KEY = 'ao5_guest_puzzle_types';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('guestStorage quota handling', () => {
  it('throws GuestStorageQuotaError when localStorage rejects with QuotaExceededError', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      const e = new DOMException('quota', 'QuotaExceededError');
      throw e;
    });
    expect(() => saveGuestSolves('333', [makeSolve()])).toThrow(GuestStorageQuotaError);
    expect(setItem).toHaveBeenCalled();
  });

  it('addGuestSolve surfaces the quota error before updating the manifest', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    expect(() => addGuestSolve('333', makeSolve())).toThrow(GuestStorageQuotaError);
    // Manifest read goes through getItem; we never wrote to it because save
    // failed first.
    expect(localStorage.getItem(MANIFEST_KEY)).toBeNull();
  });

  it('non-quota DOMExceptions propagate unchanged', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('something else', 'SecurityError');
    });
    expect(() => saveGuestSolves('333', [makeSolve()])).toThrow(DOMException);
  });
});

describe('guestStorage corrupt-JSON resilience', () => {
  it('returns [] when the per-puzzle solve blob is not valid JSON', () => {
    localStorage.setItem('ao5_guest_solves_333', '{not json');
    expect(getGuestSolves('333')).toEqual([]);
  });

  it('returns [] across all puzzles when the manifest is corrupt', () => {
    localStorage.setItem(MANIFEST_KEY, '!!!');
    expect(getAllGuestSolves()).toEqual([]);
  });

  it('treats a missing per-puzzle blob as empty', () => {
    expect(getGuestSolves('555')).toEqual([]);
  });
});

describe('removeGuestSolves manifest cleanup', () => {
  it('drops a puzzle type from the manifest when all its solves are removed', () => {
    const a1 = makeSolve({ id: 'a1', puzzle_type: '333' });
    const a2 = makeSolve({ id: 'a2', puzzle_type: '333' });
    const b1 = makeSolve({ id: 'b1', puzzle_type: '222' });
    addGuestSolve('333', a1);
    addGuestSolve('333', a2);
    addGuestSolve('222', b1);
    expect(JSON.parse(localStorage.getItem(MANIFEST_KEY) ?? '[]')).toEqual(
      expect.arrayContaining(['333', '222']),
    );

    removeGuestSolves([a1, a2]);

    const manifest = JSON.parse(localStorage.getItem(MANIFEST_KEY) ?? '[]');
    expect(manifest).toEqual(['222']);
    expect(localStorage.getItem('ao5_guest_solves_333')).toBeNull();
    expect(getGuestSolves('222')).toHaveLength(1);
  });

  it('keeps a puzzle in the manifest when some of its solves remain', () => {
    const a1 = makeSolve({ id: 'a1', puzzle_type: '333' });
    const a2 = makeSolve({ id: 'a2', puzzle_type: '333' });
    addGuestSolve('333', a1);
    addGuestSolve('333', a2);

    removeGuestSolves([a1]);

    expect(JSON.parse(localStorage.getItem(MANIFEST_KEY) ?? '[]')).toEqual(['333']);
    const remaining = getGuestSolves('333');
    expect(remaining.map(s => s.id)).toEqual(['a2']);
  });

  it('is a no-op for an empty input array', () => {
    const a1 = makeSolve({ id: 'a1', puzzle_type: '333' });
    addGuestSolve('333', a1);

    removeGuestSolves([]);

    expect(getGuestSolves('333')).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(MANIFEST_KEY) ?? '[]')).toEqual(['333']);
  });
});
