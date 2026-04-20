import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useScramblePreviewSettings from './useScramblePreviewSettings';

const KEY = 'decipher.scramble-preview';

beforeEach(() => {
  localStorage.clear();
});

describe('useScramblePreviewSettings', () => {
  it('defaults to mode=3D and collapsed=false when storage is empty', () => {
    const { result } = renderHook(() => useScramblePreviewSettings());
    expect(result.current.mode).toBe('3D');
    expect(result.current.collapsed).toBe(false);
  });

  it('hydrates from localStorage', () => {
    localStorage.setItem(KEY, JSON.stringify({ mode: '2D', collapsed: true }));
    const { result } = renderHook(() => useScramblePreviewSettings());
    expect(result.current.mode).toBe('2D');
    expect(result.current.collapsed).toBe(true);
  });

  it('setMode persists to localStorage', () => {
    const { result } = renderHook(() => useScramblePreviewSettings());
    act(() => result.current.setMode('2D'));
    expect(result.current.mode).toBe('2D');
    expect(JSON.parse(localStorage.getItem(KEY)!).mode).toBe('2D');
  });

  it('setCollapsed persists to localStorage', () => {
    const { result } = renderHook(() => useScramblePreviewSettings());
    act(() => result.current.setCollapsed(true));
    expect(result.current.collapsed).toBe(true);
    expect(JSON.parse(localStorage.getItem(KEY)!).collapsed).toBe(true);
  });

  it('ignores malformed storage and falls back to defaults', () => {
    localStorage.setItem(KEY, 'not-json');
    const { result } = renderHook(() => useScramblePreviewSettings());
    expect(result.current.mode).toBe('3D');
    expect(result.current.collapsed).toBe(false);
  });

  it('defaults enabled=true when storage is empty', () => {
    const { result } = renderHook(() => useScramblePreviewSettings());
    expect(result.current.enabled).toBe(true);
  });

  it('hydrates enabled from localStorage', () => {
    localStorage.setItem(KEY, JSON.stringify({ mode: '3D', collapsed: false, enabled: false }));
    const { result } = renderHook(() => useScramblePreviewSettings());
    expect(result.current.enabled).toBe(false);
  });

  it('setEnabled persists to localStorage', () => {
    const { result } = renderHook(() => useScramblePreviewSettings());
    act(() => result.current.setEnabled(false));
    expect(result.current.enabled).toBe(false);
    expect(JSON.parse(localStorage.getItem(KEY)!).enabled).toBe(false);
  });

  it('falls back to enabled=true when the stored value is not a boolean', () => {
    localStorage.setItem(KEY, JSON.stringify({ mode: '3D', collapsed: false, enabled: 'yes' }));
    const { result } = renderHook(() => useScramblePreviewSettings());
    expect(result.current.enabled).toBe(true);
  });
});
