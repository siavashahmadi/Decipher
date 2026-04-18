import { useRef, useCallback } from 'react';

/**
 * useCircularBuffer — DSA-3: Ring Buffer
 *
 * A fixed-capacity FIFO that overwrites the oldest element on push
 * without allocating a new array. Useful for rolling window stats where
 * you only ever need the last N items.
 *
 * Complexity:
 *   push   — O(1), no allocation
 *   toArray — O(capacity), one pass
 *
 * Compare to: Array.push + slice = O(n) per insert because slice copies
 * all remaining elements. At 500 solves with a window of 12, the buffer
 * approach is 500x cheaper per insertion.
 *
 * Internal layout:
 *   [  item3, item4, item0, item1, item2  ]
 *                    ^head (oldest, next write target)
 *   toArray reads from head → head+size, wrapping at capacity.
 */

interface CircularBufferState<T> {
  items: (T | null)[];
  head: number;
  size: number;
}

export interface CircularBuffer<T> {
  push: (item: T) => void;
  toArray: () => T[];
  getSize: () => number;
  reset: () => void;
}

const useCircularBuffer = <T,>(capacity: number): CircularBuffer<T> => {
  const capacityRef = useRef(capacity);

  const state = useRef<CircularBufferState<T>>({
    items: new Array<T | null>(capacity).fill(null),
    head: 0,
    size: 0,
  });

  const push = useCallback((item: T): void => {
    const cap = capacityRef.current;
    const s = state.current;
    s.items[s.head] = item;
    s.head = (s.head + 1) % cap;
    if (s.size < cap) s.size += 1;
  }, []);

  const toArray = useCallback((): T[] => {
    const cap = capacityRef.current;
    const { items, head, size } = state.current;
    const result: T[] = new Array<T>(size);
    const start = size < cap ? 0 : head;
    for (let i = 0; i < size; i++) {
      result[i] = items[(start + i) % cap] as T;
    }
    return result;
  }, []);

  const reset = useCallback((): void => {
    const cap = capacityRef.current;
    state.current = {
      items: new Array<T | null>(cap).fill(null),
      head: 0,
      size: 0,
    };
  }, []);

  const getSize = useCallback((): number => state.current.size, []);

  return { push, toArray, getSize, reset };
};

export default useCircularBuffer;
