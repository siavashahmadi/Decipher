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
const useCircularBuffer = (capacity) => {
  const capacityRef = useRef(capacity);

  // Use a ref so push() never triggers a re-render — callers read via toArray()
  const state = useRef({
    items: new Array(capacity).fill(null),
    head: 0,   // index of the next write slot (= oldest item when full)
    size: 0,
  });

  // Push a new item; evicts the oldest when full.
  const push = useCallback((item) => {
    const cap = capacityRef.current;
    const s = state.current;
    s.items[s.head] = item;
    s.head = (s.head + 1) % cap;
    if (s.size < cap) s.size += 1;
  }, []);

  // Return items in insertion order (oldest → newest).
  const toArray = useCallback(() => {
    const cap = capacityRef.current;
    const { items, head, size } = state.current;
    const result = new Array(size);
    const start = size < cap ? 0 : head; // if not full, head is always 0
    for (let i = 0; i < size; i++) {
      result[i] = items[(start + i) % cap];
    }
    return result;
  }, []);

  // Reset to empty (e.g. on puzzle type change).
  const reset = useCallback(() => {
    const cap = capacityRef.current;
    state.current = {
      items: new Array(cap).fill(null),
      head: 0,
      size: 0,
    };
  }, []);

  const getSize = useCallback(() => state.current.size, []);

  return { push, toArray, getSize, reset };
};

export default useCircularBuffer;
