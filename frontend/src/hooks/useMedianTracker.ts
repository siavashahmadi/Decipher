import { useCallback, useMemo, useRef } from 'react';

// ---------------------------------------------------------------------------
// DSA-4: Two-Heap Running Median
//
// Maintains the median of a stream of numbers in O(log n) per insert and
// O(1) per getMedian query, using two heaps:
//
//   lo — max-heap of the lower half  (peek = largest of lower half)
//   hi — min-heap of the upper half  (peek = smallest of upper half)
//
// Invariant: lo.size >= hi.size  and  lo.size - hi.size <= 1
//
// getMedian:
//   odd total  → lo.peek()                        (lo holds the middle)
//   even total → (lo.peek() + hi.peek()) / 2
// ---------------------------------------------------------------------------

type Comparator<T> = (a: T, b: T) => boolean;

class BinaryHeap<T> {
  private _data: T[] = [];
  private _cmp: Comparator<T>;

  constructor(compare: Comparator<T>) {
    this._cmp = compare;
  }

  get size(): number {
    return this._data.length;
  }

  peek(): T | undefined {
    return this._data[0];
  }

  push(val: T): void {
    this._data.push(val);
    let i = this._data.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this._cmp(this._data[i], this._data[p])) break;
      [this._data[p], this._data[i]] = [this._data[i], this._data[p]];
      i = p;
    }
  }

  pop(): T | undefined {
    const top = this._data[0];
    const last = this._data.pop();
    if (this._data.length > 0 && last !== undefined) {
      this._data[0] = last;
      let i = 0;
      const n = this._data.length;
      while (true) {
        let best = i;
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        if (l < n && this._cmp(this._data[l], this._data[best])) best = l;
        if (r < n && this._cmp(this._data[r], this._data[best])) best = r;
        if (best === i) break;
        [this._data[best], this._data[i]] = [this._data[i], this._data[best]];
        i = best;
      }
    }
    return top;
  }

  clear(): void {
    this._data = [];
  }
}

export interface MedianTracker {
  push: (val: number) => void;
  getMedian: () => number | null;
  reset: () => void;
  getSize: () => number;
}

const useMedianTracker = (): MedianTracker => {
  const lo = useRef(new BinaryHeap<number>((a, b) => a > b));
  const hi = useRef(new BinaryHeap<number>((a, b) => a < b));

  const rebalance = (): void => {
    if (lo.current.size < hi.current.size) {
      const top = hi.current.pop();
      if (top !== undefined) lo.current.push(top);
    }
    if (lo.current.size - hi.current.size > 1) {
      const top = lo.current.pop();
      if (top !== undefined) hi.current.push(top);
    }
  };

  const push = useCallback((val: number): void => {
    const loTop = lo.current.peek();
    if (lo.current.size === 0 || loTop === undefined || val <= loTop) {
      lo.current.push(val);
    } else {
      hi.current.push(val);
    }
    rebalance();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const getMedian = useCallback((): number | null => {
    if (lo.current.size === 0) return null;
    const loTop = lo.current.peek();
    if (loTop === undefined) return null;
    if (lo.current.size > hi.current.size) return loTop;
    const hiTop = hi.current.peek();
    if (hiTop === undefined) return loTop;
    return (loTop + hiTop) / 2;
  }, []);

  const reset = useCallback((): void => {
    lo.current.clear();
    hi.current.clear();
  }, []);

  const getSize = useCallback((): number => lo.current.size + hi.current.size, []);

  return useMemo(
    () => ({ push, getMedian, reset, getSize }),
    [push, getMedian, reset, getSize],
  );
};

export default useMedianTracker;
