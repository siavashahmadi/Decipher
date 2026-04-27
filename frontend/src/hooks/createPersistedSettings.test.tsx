import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createPersistedSettings } from './createPersistedSettings';

interface TestState {
  count: number;
  name: string;
  flag: boolean;
}

const DEFAULTS: TestState = { count: 0, name: 'default', flag: true };

const parse = (raw: unknown): Partial<TestState> => {
  const out: Partial<TestState> = {};
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    if (typeof r.count === 'number') out.count = r.count;
    if (typeof r.name === 'string') out.name = r.name;
    if (typeof r.flag === 'boolean') out.flag = r.flag;
  }
  return out;
};

const STORAGE_KEY = 'test.persisted';

const { Provider, useHook } = createPersistedSettings<TestState>({
  storageKey: STORAGE_KEY,
  defaults: DEFAULTS,
  parse,
});

const makeWrapper = () =>
  ({ children }: { children: ReactNode }) => <Provider>{children}</Provider>;

beforeEach(() => {
  localStorage.clear();
});

describe('createPersistedSettings', () => {
  it('uses defaults when localStorage is empty', () => {
    const { result } = renderHook(() => useHook(), { wrapper: makeWrapper() });
    expect(result.current.value).toEqual(DEFAULTS);
  });

  it('restores valid stored values on first mount', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ count: 42, name: 'stored', flag: false }));
    const { result } = renderHook(() => useHook(), { wrapper: makeWrapper() });
    expect(result.current.value).toEqual({ count: 42, name: 'stored', flag: false });
  });

  it('falls back to defaults for per-field invalid values', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ count: 'bad', name: 123, flag: 'yes' }));
    const { result } = renderHook(() => useHook(), { wrapper: makeWrapper() });
    expect(result.current.value).toEqual(DEFAULTS);
  });

  it('falls back to defaults on invalid JSON', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json');
    const { result } = renderHook(() => useHook(), { wrapper: makeWrapper() });
    expect(result.current.value).toEqual(DEFAULTS);
  });

  it('partially restores valid fields while falling back on invalid ones', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ count: 7, name: 456, flag: false }));
    const { result } = renderHook(() => useHook(), { wrapper: makeWrapper() });
    expect(result.current.value.count).toBe(7);
    expect(result.current.value.name).toBe('default');
    expect(result.current.value.flag).toBe(false);
  });

  it('update() patches state and persists to localStorage', () => {
    const { result } = renderHook(() => useHook(), { wrapper: makeWrapper() });
    act(() => result.current.update({ count: 5 }));
    expect(result.current.value.count).toBe(5);
    expect(result.current.value.name).toBe('default');
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.count).toBe(5);
  });

  it('update() with a full patch replaces all fields', () => {
    const { result } = renderHook(() => useHook(), { wrapper: makeWrapper() });
    act(() => result.current.update({ count: 99, name: 'new', flag: false }));
    expect(result.current.value).toEqual({ count: 99, name: 'new', flag: false });
  });

  it('writes to localStorage on every update', () => {
    const { result } = renderHook(() => useHook(), { wrapper: makeWrapper() });
    act(() => result.current.update({ count: 1 }));
    act(() => result.current.update({ count: 2 }));
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.count).toBe(2);
  });

  it('is SSR-safe: returns defaults when localStorage is unavailable', () => {
    const original = Object.getOwnPropertyDescriptor(global, 'localStorage');
    Object.defineProperty(global, 'localStorage', {
      get: () => { throw new Error('no localStorage'); },
      configurable: true,
    });
    try {
      const { result } = renderHook(() => useHook(), { wrapper: makeWrapper() });
      expect(result.current.value).toEqual(DEFAULTS);
    } finally {
      if (original) Object.defineProperty(global, 'localStorage', original);
    }
  });
});
