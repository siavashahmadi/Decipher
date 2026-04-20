import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import type { ReactNode } from 'react';
import { setSoundEnabled as applySoundEnabled } from '../utils/sound';

export type Theme = 'system' | 'dark' | 'light';
export type EffectiveTheme = 'dark' | 'light';

export interface SettingsState {
  theme: Theme;
  inspectionEnabled: boolean;
  soundEnabled: boolean;
  holdMs: number;
}

export interface SettingsContextValue extends SettingsState {
  effectiveTheme: EffectiveTheme;
  setTheme: (t: Theme) => void;
  setInspectionEnabled: (v: boolean) => void;
  setSoundEnabled: (v: boolean) => void;
  setHoldMs: (ms: number) => void;
}

const STORAGE_KEY = 'decipher.settings';
const DEFAULTS: SettingsState = {
  theme: 'system',
  inspectionEnabled: true,
  soundEnabled: false,
  holdMs: 550,
};

const clampHold = (n: number): number => Math.max(0, Math.min(1000, Math.round(n)));

const readInitial = (): SettingsState => {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<SettingsState>;
    return {
      theme: parsed.theme === 'dark' || parsed.theme === 'light' || parsed.theme === 'system'
        ? parsed.theme : DEFAULTS.theme,
      inspectionEnabled: typeof parsed.inspectionEnabled === 'boolean'
        ? parsed.inspectionEnabled : DEFAULTS.inspectionEnabled,
      soundEnabled: typeof parsed.soundEnabled === 'boolean'
        ? parsed.soundEnabled : DEFAULTS.soundEnabled,
      holdMs: typeof parsed.holdMs === 'number'
        ? clampHold(parsed.holdMs) : DEFAULTS.holdMs,
    };
  } catch {
    return DEFAULTS;
  }
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

interface ProviderProps { children: ReactNode }

export const SettingsProvider = ({ children }: ProviderProps): React.ReactElement => {
  const [state, setState] = useState<SettingsState>(readInitial);
  const [systemPrefersLight, setSystemPrefersLight] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-color-scheme: light)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = (e: MediaQueryListEvent): void => setSystemPrefersLight(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const effectiveTheme: EffectiveTheme =
    state.theme === 'system' ? (systemPrefersLight ? 'light' : 'dark') : state.theme;

  useEffect(() => {
    document.documentElement.dataset.theme = effectiveTheme;
  }, [effectiveTheme]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    applySoundEnabled(state.soundEnabled);
  }, [state.soundEnabled]);

  const setTheme = useCallback((theme: Theme) => setState(p => ({ ...p, theme })), []);
  const setInspectionEnabled = useCallback(
    (inspectionEnabled: boolean) => setState(p => ({ ...p, inspectionEnabled })), []);
  const setSoundEnabled = useCallback(
    (soundEnabled: boolean) => setState(p => ({ ...p, soundEnabled })), []);
  const setHoldMs = useCallback(
    (ms: number) => setState(p => ({ ...p, holdMs: clampHold(ms) })), []);

  const value = useMemo<SettingsContextValue>(() => ({
    ...state,
    effectiveTheme,
    setTheme,
    setInspectionEnabled,
    setSoundEnabled,
    setHoldMs,
  }), [state, effectiveTheme, setTheme, setInspectionEnabled, setSoundEnabled, setHoldMs]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};

export const useSettings = (): SettingsContextValue => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
};
