import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import useMedianTracker from './useMedianTracker';

describe('useMedianTracker', () => {
  it('returns a stable identity across re-renders', () => {
    const { result, rerender } = renderHook(() => useMedianTracker());
    const first = result.current;
    rerender();
    const second = result.current;
    expect(second).toBe(first);
  });

  it('computes median correctly across pushes', () => {
    const { result } = renderHook(() => useMedianTracker());
    expect(result.current.getMedian()).toBeNull();
    result.current.push(5);
    expect(result.current.getMedian()).toBe(5);
    result.current.push(1);
    expect(result.current.getMedian()).toBe(3);
    result.current.push(3);
    expect(result.current.getMedian()).toBe(3);
    result.current.push(9);
    expect(result.current.getMedian()).toBe(4);
  });

  it('reset clears state', () => {
    const { result } = renderHook(() => useMedianTracker());
    result.current.push(1);
    result.current.push(2);
    result.current.reset();
    expect(result.current.getMedian()).toBeNull();
  });
});
