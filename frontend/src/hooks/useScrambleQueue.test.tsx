import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import useScrambleQueue, { UseScrambleQueueResult } from './useScrambleQueue';

let counter = 0;
let pending: Array<() => void> = [];

vi.mock('cubing/scramble', () => ({
  randomScrambleForEvent: vi.fn(async (type: string) => {
    counter += 1;
    const id = counter;
    await new Promise<void>(resolve => { pending.push(resolve); });
    return { toString: () => `${type}-scramble-${id}` };
  }),
}));

const flushAll = async (): Promise<void> => {
  while (pending.length > 0) {
    const batch = pending;
    pending = [];
    batch.forEach(fn => fn());
    await Promise.resolve();
    await Promise.resolve();
  }
};

beforeEach(() => {
  counter = 0;
  pending = [];
});

describe('useScrambleQueue', () => {
  it('starts with both scrambles null and loading=true', () => {
    const { result } = renderHook(() => useScrambleQueue('333'));
    expect(result.current.currentScramble).toBeNull();
    expect(result.current.nextScramble).toBeNull();
    expect(result.current.loading).toBe(true);
  });

  it('populates current and next after initial generation', async () => {
    const { result } = renderHook(() => useScrambleQueue('333'));
    await act(async () => { await flushAll(); });
    await waitFor(() => expect(result.current.currentScramble).not.toBeNull());
    expect(result.current.currentScramble).toBe('333-scramble-1');
    expect(result.current.nextScramble).toBe('333-scramble-2');
    expect(result.current.loading).toBe(false);
  });

  it('advance() promotes next to current and refills next', async () => {
    const { result } = renderHook(() => useScrambleQueue('333'));
    await act(async () => { await flushAll(); });
    await waitFor(() => expect(result.current.currentScramble).toBe('333-scramble-1'));

    act(() => { result.current.advance(); });
    expect(result.current.currentScramble).toBe('333-scramble-2');
    expect(result.current.nextScramble).toBeNull();

    await act(async () => { await flushAll(); });
    await waitFor(() => expect(result.current.nextScramble).toBe('333-scramble-3'));
  });

  it('changing puzzle type resets and regenerates with new type', async () => {
    const { result, rerender } = renderHook<UseScrambleQueueResult, { p: '333' | '444' }>(
      ({ p }) => useScrambleQueue(p),
      { initialProps: { p: '333' } },
    );
    await act(async () => { await flushAll(); });
    await waitFor(() => expect(result.current.currentScramble).toBe('333-scramble-1'));

    rerender({ p: '444' as const });
    expect(result.current.currentScramble).toBeNull();
    expect(result.current.nextScramble).toBeNull();

    await act(async () => { await flushAll(); });
    await waitFor(() => expect(result.current.currentScramble?.startsWith('444-')).toBe(true));
    expect(result.current.nextScramble?.startsWith('444-')).toBe(true);
  });

  it('discards stale resolutions when puzzle type changes mid-flight', async () => {
    const { result, rerender } = renderHook<UseScrambleQueueResult, { p: '333' | '444' }>(
      ({ p }) => useScrambleQueue(p),
      { initialProps: { p: '333' } },
    );
    rerender({ p: '444' as const });
    await act(async () => { await flushAll(); });
    await waitFor(() => expect(result.current.currentScramble).not.toBeNull());
    expect(result.current.currentScramble?.startsWith('444-')).toBe(true);
    expect(result.current.nextScramble?.startsWith('444-')).toBe(true);
  });

  it('override() sets currentScramble without regenerating next', async () => {
    const { result } = renderHook(() => useScrambleQueue('333'));
    await act(async () => { await flushAll(); });
    await waitFor(() => expect(result.current.currentScramble).not.toBeNull());
    const originalNext = result.current.nextScramble;
    act(() => { result.current.override("R U R' U'"); });
    expect(result.current.currentScramble).toBe("R U R' U'");
    expect(result.current.nextScramble).toBe(originalNext);
  });
});
