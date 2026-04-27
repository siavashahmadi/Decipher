import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactElement, type ReactNode,
} from 'react';
import { setSoundEnabled as applySoundEnabled } from '../utils/sound';
import { createPersistedSettings } from './createPersistedSettings';

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

const { Provider: PersistedSettingsProvider, useHook: usePersistedSettings } =
  createPersistedSettings<SettingsState>({
    storageKey: STORAGE_KEY,
    defaults: DEFAULTS,
    parse: (raw: unknown): Partial<SettingsState> => {
      const out: Partial<SettingsState> = {};
      if (!raw || typeof raw !== 'object') return out;
      const r = raw as Record<string, unknown>;
      if (r.theme === 'dark' || r.theme === 'light' || r.theme === 'system') out.theme = r.theme;
      if (typeof r.inspectionEnabled === 'boolean') out.inspectionEnabled = r.inspectionEnabled;
      if (typeof r.soundEnabled === 'boolean') out.soundEnabled = r.soundEnabled;
      if (typeof r.holdMs === 'number') out.holdMs = clampHold(r.holdMs);
      return out;
    },
  });

const SettingsContext = createContext<SettingsContextValue | null>(null);

interface ProviderProps { children: ReactNode }

const InnerSettingsProvider = ({ children }: ProviderProps): ReactElement => {
  const { value: state, update } = usePersistedSettings();

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
    applySoundEnabled(state.soundEnabled);
  }, [state.soundEnabled]);

  const setTheme = useCallback((theme: Theme) => update({ theme }), [update]);
  const setInspectionEnabled = useCallback(
    (inspectionEnabled: boolean) => update({ inspectionEnabled }), [update]);
  const setSoundEnabled = useCallback(
    (soundEnabled: boolean) => update({ soundEnabled }), [update]);
  const setHoldMs = useCallback(
    (ms: number) => update({ holdMs: clampHold(ms) }), [update]);

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

export const SettingsProvider = ({ children }: ProviderProps): ReactElement => (
  <PersistedSettingsProvider>
    <InnerSettingsProvider>{children}</InnerSettingsProvider>
  </PersistedSettingsProvider>
);

export const useSettings = (): SettingsContextValue => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
};
