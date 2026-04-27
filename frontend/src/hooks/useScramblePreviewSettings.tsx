import { createContext, useCallback, useContext, useMemo, type ReactElement, type ReactNode } from 'react';
import { createPersistedSettings } from './createPersistedSettings';

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

type PersistedState = {
  mode: PreviewMode;
  collapsed: boolean;
  enabled: boolean;
  showHintFacelets: boolean;
};

const DEFAULTS: PersistedState = {
  mode: '3D',
  collapsed: false,
  enabled: true,
  showHintFacelets: false,
};

const { Provider: PersistedProvider, useHook: usePersistedHook } =
  createPersistedSettings<PersistedState>({
    storageKey: STORAGE_KEY,
    defaults: DEFAULTS,
    parse: (raw: unknown): Partial<PersistedState> => {
      const out: Partial<PersistedState> = {};
      if (!raw || typeof raw !== 'object') return out;
      const r = raw as Record<string, unknown>;
      if (r.mode === '2D' || r.mode === '3D') out.mode = r.mode;
      if (typeof r.collapsed === 'boolean') out.collapsed = r.collapsed;
      if (typeof r.enabled === 'boolean') out.enabled = r.enabled;
      if (typeof r.showHintFacelets === 'boolean') out.showHintFacelets = r.showHintFacelets;
      return out;
    },
  });

const ScramblePreviewSettingsContext = createContext<ScramblePreviewSettings | null>(null);

interface ScramblePreviewSettingsProviderProps {
  children: ReactNode;
}

const InnerProvider = ({ children }: ScramblePreviewSettingsProviderProps): ReactElement => {
  const { value: state, update } = usePersistedHook();

  const setMode = useCallback((mode: PreviewMode) => update({ mode }), [update]);
  const setCollapsed = useCallback((collapsed: boolean) => update({ collapsed }), [update]);
  const setEnabled = useCallback((enabled: boolean) => update({ enabled }), [update]);
  const setShowHintFacelets = useCallback(
    (showHintFacelets: boolean) => update({ showHintFacelets }), [update]);

  const value = useMemo<ScramblePreviewSettings>(
    () => ({
      mode: state.mode,
      collapsed: state.collapsed,
      enabled: state.enabled,
      showHintFacelets: state.showHintFacelets,
      setMode,
      setCollapsed,
      setEnabled,
      setShowHintFacelets,
    }),
    [state.mode, state.collapsed, state.enabled, state.showHintFacelets, setMode, setCollapsed, setEnabled, setShowHintFacelets],
  );

  return (
    <ScramblePreviewSettingsContext.Provider value={value}>
      {children}
    </ScramblePreviewSettingsContext.Provider>
  );
};

export const ScramblePreviewSettingsProvider = ({
  children,
}: ScramblePreviewSettingsProviderProps): ReactElement => (
  <PersistedProvider>
    <InnerProvider>{children}</InnerProvider>
  </PersistedProvider>
);

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
