import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { SettingsProvider, useSettings } from './useSettings';

const STORAGE_KEY = 'decipher.settings';

const Probe = (): JSX.Element => {
  const s = useSettings();
  return (
    <>
      <div data-testid="theme">{s.theme}</div>
      <div data-testid="effective">{s.effectiveTheme}</div>
      <div data-testid="inspection">{String(s.inspectionEnabled)}</div>
      <div data-testid="sound">{String(s.soundEnabled)}</div>
      <div data-testid="hold">{s.holdMs}</div>
      <button onClick={() => s.setTheme('light')}>light</button>
      <button onClick={() => s.setInspectionEnabled(false)}>insp-off</button>
      <button onClick={() => s.setSoundEnabled(true)}>sound-on</button>
      <button onClick={() => s.setHoldMs(0)}>hold-zero</button>
    </>
  );
};

describe('useSettings', () => {
  beforeEach(() => {
    localStorage.clear();
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia;
  });

  it('uses defaults when no localStorage entry exists', () => {
    render(<SettingsProvider><Probe /></SettingsProvider>);
    expect(screen.getByTestId('theme').textContent).toBe('system');
    expect(screen.getByTestId('inspection').textContent).toBe('true');
    expect(screen.getByTestId('sound').textContent).toBe('false');
    expect(screen.getByTestId('hold').textContent).toBe('550');
  });

  it('resolves system theme via prefers-color-scheme', () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia;
    render(<SettingsProvider><Probe /></SettingsProvider>);
    expect(screen.getByTestId('effective').textContent).toBe('light');
  });

  it('persists changes to localStorage', () => {
    render(<SettingsProvider><Probe /></SettingsProvider>);
    act(() => screen.getByText('light').click());
    act(() => screen.getByText('insp-off').click());
    act(() => screen.getByText('sound-on').click());
    act(() => screen.getByText('hold-zero').click());
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    expect(stored).toEqual({
      theme: 'light',
      inspectionEnabled: false,
      soundEnabled: true,
      holdMs: 0,
    });
  });

  it('hydrates from localStorage and writes data-theme to documentElement', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      theme: 'dark', inspectionEnabled: false, soundEnabled: true, holdMs: 200,
    }));
    render(<SettingsProvider><Probe /></SettingsProvider>);
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(screen.getByTestId('hold').textContent).toBe('200');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('clamps holdMs to [0, 1000]', () => {
    const Updater = (): JSX.Element => {
      const { setHoldMs, holdMs } = useSettings();
      return (
        <>
          <div data-testid="hold2">{holdMs}</div>
          <button onClick={() => setHoldMs(5000)}>over</button>
          <button onClick={() => setHoldMs(-10)}>under</button>
        </>
      );
    };
    render(<SettingsProvider><Updater /></SettingsProvider>);
    act(() => screen.getByText('over').click());
    expect(screen.getByTestId('hold2').textContent).toBe('1000');
    act(() => screen.getByText('under').click());
    expect(screen.getByTestId('hold2').textContent).toBe('0');
  });
});
