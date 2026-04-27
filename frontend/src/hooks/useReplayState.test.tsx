import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useNavigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useReplayState } from './useReplayState';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual };
});

function makeWrapper(initialEntries: { pathname: string; state?: unknown }[]) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={initialEntries} initialIndex={0}>
        {children}
      </MemoryRouter>
    );
  };
}

describe('useReplayState', () => {
  it('returns scramble and puzzle from location state', () => {
    const wrapper = makeWrapper([
      { pathname: '/timer', state: { replayScramble: 'R U R\'', replayPuzzle: '333' } },
    ]);
    const { result } = renderHook(() => useReplayState(), { wrapper });
    expect(result.current.scramble).toBe("R U R'");
    expect(result.current.puzzle).toBe('333');
  });

  it('returns same values on subsequent renders (state is stable)', () => {
    const wrapper = makeWrapper([
      { pathname: '/timer', state: { replayScramble: 'F B U', replayPuzzle: '222' } },
    ]);
    const { result, rerender } = renderHook(() => useReplayState(), { wrapper });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('returns undefined scramble and puzzle when location state is null', () => {
    const wrapper = makeWrapper([{ pathname: '/timer', state: null }]);
    const { result } = renderHook(() => useReplayState(), { wrapper });
    expect(result.current.scramble).toBeUndefined();
    expect(result.current.puzzle).toBeUndefined();
  });

  it('returns undefined scramble and puzzle when location state is empty object', () => {
    const wrapper = makeWrapper([{ pathname: '/timer', state: {} }]);
    const { result } = renderHook(() => useReplayState(), { wrapper });
    expect(result.current.scramble).toBeUndefined();
    expect(result.current.puzzle).toBeUndefined();
  });
});
