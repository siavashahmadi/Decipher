import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export type PreviewMode = '3D' | '2D';

export interface ScramblePreviewSettings {
  mode: PreviewMode;
  collapsed: boolean;
  enabled: boolean;
  showHintFacelets: boolean;
  setMode: (mode: PreviewMode) => void;
  setCollapsed: (collapsed: boolean) => void;
  setEnabled: (enabled: boolean) => void;
  setShowHintFacelets: (show: boolean) => void;
}

const STORAGE_KEY = 'decipher.scramble-preview';
const DEFAULTS = {
  mode: '3D' as PreviewMode,
  collapsed: false,
  enabled: true,
  showHintFacelets: false,
};

type PersistedState = {
  mode: PreviewMode;
  collapsed: boolean;
  enabled: boolean;
  showHintFacelets: boolean;
};

const readInitial = (): PersistedState => {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      mode: parsed.mode === '2D' || parsed.mode === '3D' ? parsed.mode : DEFAULTS.mode,
      collapsed: typeof parsed.collapsed === 'boolean' ? parsed.collapsed : DEFAULTS.collapsed,
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULTS.enabled,
      showHintFacelets: typeof parsed.showHintFacelets === 'boolean' ? parsed.showHintFacelets : DEFAULTS.showHintFacelets,
    };
  } catch {
    return DEFAULTS;
  }
};

const ScramblePreviewSettingsContext = createContext<ScramblePreviewSettings | null>(null);

interface ScramblePreviewSettingsProviderProps {
  children: ReactNode;
}

export const ScramblePreviewSettingsProvider = ({
  children,
}: ScramblePreviewSettingsProviderProps): React.ReactElement => {
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

  const setShowHintFacelets = useCallback((showHintFacelets: boolean) => {
    setState(prev => ({ ...prev, showHintFacelets }));
  }, []);

  const value: ScramblePreviewSettings = {
    mode: state.mode,
    collapsed: state.collapsed,
    enabled: state.enabled,
    showHintFacelets: state.showHintFacelets,
    setMode,
    setCollapsed,
    setEnabled,
    setShowHintFacelets,
  };

  return (
    <ScramblePreviewSettingsContext.Provider value={value}>
      {children}
    </ScramblePreviewSettingsContext.Provider>
  );
};

const useScramblePreviewSettings = (): ScramblePreviewSettings => {
  const ctx = useContext(ScramblePreviewSettingsContext);
  if (!ctx) {
    throw new Error(
      'useScramblePreviewSettings must be used within a ScramblePreviewSettingsProvider',
    );
  }
  return ctx;
};

export default useScramblePreviewSettings;
