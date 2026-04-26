// Linear two-pointer merge of two ascending-sorted arrays. O(n + m), no
// in-place mutation of either input. Use instead of [...a, ...b].sort()
// when both inputs are already sorted.
export const mergeSortedAsc = (a: readonly number[], b: readonly number[]): number[] => {
  const out: number[] = new Array(a.length + b.length);
  let i = 0;
  let j = 0;
  let k = 0;
  while (i < a.length && j < b.length) {
    if (a[i] <= b[j]) {
      out[k++] = a[i++];
    } else {
      out[k++] = b[j++];
    }
  }
  while (i < a.length) out[k++] = a[i++];
  while (j < b.length) out[k++] = b[j++];
  return out;
};
