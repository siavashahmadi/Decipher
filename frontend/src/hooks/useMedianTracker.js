import { useCallback, useRef } from 'react';

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

class BinaryHeap {
  // compare(a, b) returns true if a should be above b in the heap.
  // Max-heap: compare = (a, b) => a > b
  // Min-heap: compare = (a, b) => a < b
  constructor(compare) {
    this._data = [];
    this._cmp = compare;
  }

  get size() { return this._data.length; }
  peek()     { return this._data[0]; }

  push(val) {
    this._data.push(val);
    let i = this._data.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this._cmp(this._data[i], this._data[p])) break;
      [this._data[p], this._data[i]] = [this._data[i], this._data[p]];
      i = p;
    }
  }

  pop() {
    const top = this._data[0];
    const last = this._data.pop();
    if (this._data.length > 0) {
      this._data[0] = last;
      let i = 0;
      const n = this._data.length;
      while (true) {
        let best = i;
        const l = 2 * i + 1, r = 2 * i + 2;
        if (l < n && this._cmp(this._data[l], this._data[best])) best = l;
        if (r < n && this._cmp(this._data[r], this._data[best])) best = r;
        if (best === i) break;
        [this._data[best], this._data[i]] = [this._data[i], this._data[best]];
        i = best;
      }
    }
    return top;
  }

  clear() { this._data = []; }
}

const useMedianTracker = () => {
  const lo = useRef(new BinaryHeap((a, b) => a > b)); // max-heap (lower half)
  const hi = useRef(new BinaryHeap((a, b) => a < b)); // min-heap (upper half)

  const rebalance = () => {
    // Ensure lo is never smaller than hi, and the size difference is at most 1
    if (lo.current.size < hi.current.size) {
      lo.current.push(hi.current.pop());
    }
    if (lo.current.size - hi.current.size > 1) {
      hi.current.push(lo.current.pop());
    }
  };

  const push = useCallback((val) => {
    if (lo.current.size === 0 || val <= lo.current.peek()) {
      lo.current.push(val);
    } else {
      hi.current.push(val);
    }
    rebalance();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const getMedian = useCallback(() => {
    if (lo.current.size === 0) return null;
    if (lo.current.size > hi.current.size) return lo.current.peek();
    return (lo.current.peek() + hi.current.peek()) / 2;
  }, []);

  const reset = useCallback(() => {
    lo.current.clear();
    hi.current.clear();
  }, []);

  const getSize = useCallback(() => lo.current.size + hi.current.size, []);

  return { push, getMedian, reset, getSize };
};

export default useMedianTracker;
