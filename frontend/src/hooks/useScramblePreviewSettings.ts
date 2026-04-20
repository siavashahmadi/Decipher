import { useCallback, useEffect, useState } from 'react';

export type PreviewMode = '3D' | '2D';

export interface ScramblePreviewSettings {
  mode: PreviewMode;
  collapsed: boolean;
  enabled: boolean;
  setMode: (mode: PreviewMode) => void;
  setCollapsed: (collapsed: boolean) => void;
  setEnabled: (enabled: boolean) => void;
}

const STORAGE_KEY = 'decipher.scramble-preview';
const DEFAULTS = { mode: '3D' as PreviewMode, collapsed: false, enabled: true };

const readInitial = (): { mode: PreviewMode; collapsed: boolean; enabled: boolean } => {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<{ mode: PreviewMode; collapsed: boolean; enabled: boolean }>;
    return {
      mode: parsed.mode === '2D' || parsed.mode === '3D' ? parsed.mode : DEFAULTS.mode,
      collapsed: typeof parsed.collapsed === 'boolean' ? parsed.collapsed : DEFAULTS.collapsed,
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULTS.enabled,
    };
  } catch {
    return DEFAULTS;
  }
};

const useScramblePreviewSettings = (): ScramblePreviewSettings => {
  const [state, setState] = useState(readInitial);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const setMode = useCallback((mode: PreviewMode) => {
    setState(prev => ({ ...prev, mode }));
  }, []);

  const setCollapsed = useCallback((collapsed: boolean) => {
    setState(prev => ({ ...prev, collapsed }));
  }, []);

  const setEnabled = useCallback((enabled: boolean) => {
    setState(prev => ({ ...prev, enabled }));
  }, []);

  return {
    mode: state.mode,
    collapsed: state.collapsed,
    enabled: state.enabled,
    setMode,
    setCollapsed,
    setEnabled,
  };
};

export default useScramblePreviewSettings;
