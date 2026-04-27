import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useReplayState } from './useReplayState';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
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

  it('calls navigate with replace=true and state=null when location.state is non-null', () => {
    navigateMock.mockClear();

    const wrapper = makeWrapper([
      { pathname: '/timer', state: { replayScramble: 'R U R\'', replayPuzzle: '333' } },
    ]);
    renderHook(() => useReplayState(), { wrapper });

    expect(navigateMock).toHaveBeenCalledWith('/timer', { replace: true, state: null });
  });
});
