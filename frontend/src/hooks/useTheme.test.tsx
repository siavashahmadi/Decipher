import { act, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from './useTheme';
import type { ReactNode } from 'react';

const wrapper = ({ children }: { children: ReactNode }) => (
  <ThemeProvider>{children}</ThemeProvider>
);

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to dark when no preference is stored and system prefers dark', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    }) as unknown as MediaQueryList);

    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('uses light when system prefers light and no stored preference', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => ({
      matches: q.includes('light'),
      media: q,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    }) as unknown as MediaQueryList);

    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe('light');
  });

  it('reads the stored preference over the system preference', () => {
    localStorage.setItem('decipher.theme', 'light');
    vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    }) as unknown as MediaQueryList);

    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe('light');
  });

  it('toggle flips the theme and persists to localStorage', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    const before = result.current.theme;
    act(() => result.current.toggle());
    const after = result.current.theme;
    expect(after).not.toBe(before);
    expect(localStorage.getItem('decipher.theme')).toBe(after);
    expect(document.documentElement.dataset.theme).toBe(after);
  });

  it('setTheme writes the chosen value to localStorage and to the html element', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => result.current.setTheme('light'));
    expect(result.current.theme).toBe('light');
    expect(localStorage.getItem('decipher.theme')).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('throws when used outside of a ThemeProvider', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const Broken = () => {
      useTheme();
      return <div>never</div>;
    };
    expect(() => render(<Broken />)).toThrow(/ThemeProvider/);
    errSpy.mockRestore();
  });
});
