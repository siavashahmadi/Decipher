# Phase 5: Solve Management & Settings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Soft-delete solves, add a clickable solve detail modal with ao5 context, expand the settings panel (theme/inspection/sound/hold-to-start), wire those settings into the timer, and add a global hotkey layer with help overlay.

**Architecture:** One Supabase migration adds `deleted_at` and an index; Flask routes filter on it and convert DELETE to UPDATE. On the frontend, a new `SettingsProvider` (`decipher.settings` in localStorage) owns theme + timer prefs and replaces the standalone `ThemeProvider`. `Timer.tsx` reads `inspectionEnabled` and `holdMs` from settings. A `SolveDetailModal` opens on row click and shows the ±2 ao5 window. `useHotkeys` lives at `SolveSession` scope, only firing when no input is focused and no modal is open.

**Tech Stack:** React 18 + TypeScript (Vite), Flask + Supabase backend, Vitest + React Testing Library, existing CSS-modules-per-component pattern, no new runtime dependencies.

---

## File Structure

**Create**
- `backend/migrations/004_soft_delete.sql` — adds `deleted_at` column + partial index
- `frontend/src/hooks/useSettings.tsx` — context provider for `decipher.settings` (theme, inspection, sound, holdMs)
- `frontend/src/hooks/useSettings.test.tsx`
- `frontend/src/hooks/useHotkeys.ts` — global hotkey listener; takes a handler map and respects input/modal focus
- `frontend/src/hooks/useHotkeys.test.tsx`
- `frontend/src/components/SolveDetailModal.tsx` — modal showing time/date/scramble/ao5 context/penalty toggles/delete
- `frontend/src/components/SolveDetailModal.css`
- `frontend/src/components/SolveDetailModal.test.tsx`
- `frontend/src/components/HotkeyHelp.tsx` — overlay shown on `?` listing all hotkeys
- `frontend/src/components/HotkeyHelp.css`

**Modify**
- `backend/app/routes/solves.py` — filter `deleted_at IS NULL` in GET, change DELETE to UPDATE
- `frontend/src/main.tsx` — wrap with `SettingsProvider` (replaces `ThemeProvider`)
- `frontend/src/hooks/useTheme.tsx` — DELETE; theme moves into `useSettings`
- `frontend/src/hooks/useTheme.test.tsx` — DELETE
- `frontend/src/components/Header.tsx` — read theme/preview from `useSettings` instead of `useTheme`
- `frontend/src/components/SettingsPanel.tsx` — add Inspection, Sound, Hold-to-start sections; theme becomes System/Dark/Light
- `frontend/src/components/SettingsPanel.test.tsx` — extend coverage
- `frontend/src/components/Timer.tsx` — read `inspectionEnabled` and `holdMs` from settings; transition idle→ready→running when inspection off
- `frontend/src/components/SolveLog.tsx` — make rows clickable, accept `onSolveClick` prop
- `frontend/src/components/SolveSession.tsx` — manage `selectedSolve` modal state, pass `onSolveClick`, mount `useHotkeys` + `HotkeyHelp`
- `frontend/src/utils/sound.ts` — wire `setSoundEnabled` from settings on mount

---

## Task 1: Backend soft-delete migration

**Files:**
- Create: `backend/migrations/004_soft_delete.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 004_soft_delete.sql
-- Soft-delete column for solves. Existing rows get NULL (active).
-- Partial index keeps the active-row scan small even when many rows
-- have been soft-deleted, which is the only path that matters at read time.

ALTER TABLE solves ADD COLUMN deleted_at TIMESTAMPTZ;
CREATE INDEX idx_solves_deleted_at ON solves (deleted_at) WHERE deleted_at IS NULL;
```

- [ ] **Step 2: Apply the migration to Supabase**

Run via the Supabase SQL editor (or `psql`) against the project DB. Verify with:

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'solves' AND column_name = 'deleted_at';
-- expect 1 row: deleted_at | timestamp with time zone
```

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/004_soft_delete.sql
git commit -m "add soft-delete column and partial index to solves"
```

---

## Task 2: Backend routes — filter and soft-delete

**Files:**
- Modify: `backend/app/routes/solves.py:42-66` (GET filter), `:158-171` (DELETE)

- [ ] **Step 1: Add `deleted_at IS NULL` filter to GET /solves**

In `get_solves`, change the chained query so it filters out soft-deleted rows. Replace lines 51–53:

```python
query = (request.supabase.table('solves')
         .select('*')
         .eq('user_id', request.user_id)
         .is_('deleted_at', None))
```

- [ ] **Step 2: Convert DELETE handler to UPDATE deleted_at**

Replace the body of `delete_solve` (lines 160–171) with:

```python
@solves.route('/solves/<solve_id>', methods=['DELETE'])
@require_auth
def delete_solve(solve_id):
    try:
        result = (request.supabase.table('solves')
                  .update({'deleted_at': 'now()'})
                  .eq('id', solve_id)
                  .eq('user_id', request.user_id)
                  .is_('deleted_at', None)
                  .execute())
        if not result.data:
            return jsonify({"error": "Solve not found"}), 404
        return jsonify(result.data[0])
    except Exception:
        return jsonify({"error": "Internal server error"}), 500
```

The extra `.is_('deleted_at', None)` ensures a second DELETE on an already-deleted row returns 404 instead of silently re-stamping `deleted_at`.

- [ ] **Step 3: Manual verification**

Start the backend (`flask --app backend.run run`), then:

```bash
# Replace TOKEN/SOLVE_ID with real values from Supabase auth
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/api/solves/$SOLVE_ID
# Expect 200 with the updated row including deleted_at set

curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:5000/api/solves?puzzle_type=333"
# Expect the deleted solve to be absent
```

In Supabase studio, confirm the row still exists with `deleted_at` populated.

- [ ] **Step 4: Commit**

```bash
git add backend/app/routes/solves.py
git commit -m "soft-delete solves and filter deleted rows from list endpoint"
```

---

## Task 3: Settings context — write tests

**Files:**
- Create: `frontend/src/hooks/useSettings.test.tsx`

- [ ] **Step 1: Write failing tests for SettingsProvider**

```tsx
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
    render(<SettingsProvider><Probe /></SettingsProvider>);
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
    const { rerender } = render(<SettingsProvider><Updater /></SettingsProvider>);
    act(() => screen.getByText('over').click());
    expect(screen.getByTestId('hold2').textContent).toBe('1000');
    act(() => screen.getByText('under').click());
    expect(screen.getByTestId('hold2').textContent).toBe('0');
    rerender(<SettingsProvider><Updater /></SettingsProvider>);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npx vitest run src/hooks/useSettings.test.tsx
```

Expected: FAIL with "Cannot find module './useSettings'".

---

## Task 4: Settings context — implementation

**Files:**
- Create: `frontend/src/hooks/useSettings.tsx`

- [ ] **Step 1: Implement SettingsProvider + useSettings**

```tsx
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

  // Track OS theme changes so 'system' stays in sync without a refresh.
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

  // Sound module holds its own enabled flag; keep it in sync.
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
```

- [ ] **Step 2: Run tests to verify pass**

```bash
cd frontend && npx vitest run src/hooks/useSettings.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useSettings.tsx frontend/src/hooks/useSettings.test.tsx
git commit -m "add SettingsProvider for theme, inspection, sound, hold-to-start"
```

---

## Task 5: Replace ThemeProvider with SettingsProvider

**Files:**
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/components/Header.tsx`
- Modify: `frontend/src/components/SettingsPanel.tsx` (theme prop type)
- Delete: `frontend/src/hooks/useTheme.tsx`, `frontend/src/hooks/useTheme.test.tsx`

- [ ] **Step 1: Swap providers in main.tsx**

Replace the contents of `frontend/src/main.tsx` with:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { SettingsProvider } from './hooks/useSettings';
import { ScramblePreviewSettingsProvider } from './hooks/useScramblePreviewSettings';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <SettingsProvider>
      <ScramblePreviewSettingsProvider>
        <App />
      </ScramblePreviewSettingsProvider>
    </SettingsProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 2: Update Header.tsx to read from useSettings**

Replace lines 1–7 imports and line 36 hook call. Concretely:

```tsx
// at top
import useScramblePreviewSettings from '../hooks/useScramblePreviewSettings';
import SettingsPanel from './SettingsPanel';
import { useSettings } from '../hooks/useSettings';
// ...
// inside Header():
const { theme, setTheme } = useSettings();
const { enabled, setEnabled, mode, setMode } = useScramblePreviewSettings();
```

Remove the `import { useTheme } from '../hooks/useTheme';` line. The rest of the JSX stays the same — `theme` is now `'system' | 'dark' | 'light'` and is passed straight through to `SettingsPanel`.

- [ ] **Step 3: Update SettingsPanel theme prop type**

In `frontend/src/components/SettingsPanel.tsx`, change line 2 from:

```tsx
import type { Theme } from '../hooks/useTheme';
```

to:

```tsx
import type { Theme } from '../hooks/useSettings';
```

(SettingsPanel will be expanded in Task 6 — for now just fix the import.)

- [ ] **Step 4: Delete obsolete files**

```bash
rm frontend/src/hooks/useTheme.tsx frontend/src/hooks/useTheme.test.tsx
```

- [ ] **Step 5: Run typecheck and tests**

```bash
cd frontend && npx tsc --noEmit && npx vitest run
```

Expected: clean. The previous `Theme = 'dark' | 'light'` switches to `'system' | 'dark' | 'light'`. The Light/Dark buttons in the existing SettingsPanel still work (they just don't expose System yet — Task 6 fixes that).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/main.tsx frontend/src/components/Header.tsx \
        frontend/src/components/SettingsPanel.tsx frontend/src/hooks/useTheme.tsx \
        frontend/src/hooks/useTheme.test.tsx
git commit -m "consolidate theme into SettingsProvider, remove standalone useTheme"
```

---

## Task 6: Expand SettingsPanel UI

**Files:**
- Modify: `frontend/src/components/SettingsPanel.tsx`
- Modify: `frontend/src/components/SettingsPanel.css`
- Modify: `frontend/src/components/SettingsPanel.test.tsx`
- Modify: `frontend/src/components/Header.tsx` (pass new props)

- [ ] **Step 1: Extend SettingsPanel props and JSX**

Rewrite `frontend/src/components/SettingsPanel.tsx`:

```tsx
import React from 'react';
import type { Theme } from '../hooks/useSettings';
import type { PreviewMode } from '../hooks/useScramblePreviewSettings';
import './SettingsPanel.css';

interface SettingsPanelProps {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  inspectionEnabled: boolean;
  setInspectionEnabled: (v: boolean) => void;
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
  holdMs: number;
  setHoldMs: (ms: number) => void;
  previewEnabled: boolean;
  setPreviewEnabled: (enabled: boolean) => void;
  previewMode: PreviewMode;
  setPreviewMode: (mode: PreviewMode) => void;
}

const THEMES: Theme[] = ['system', 'light', 'dark'];

const SettingsPanel = ({
  theme, setTheme,
  inspectionEnabled, setInspectionEnabled,
  soundEnabled, setSoundEnabled,
  holdMs, setHoldMs,
  previewEnabled, setPreviewEnabled,
  previewMode, setPreviewMode,
}: SettingsPanelProps): React.ReactElement => {
  return (
    <div className="settings-panel" role="dialog" aria-label="Settings">
      <h2 className="settings-panel-title">Settings</h2>

      <div className="settings-row">
        <span className="settings-row-label">Theme</span>
        <div className="settings-segmented">
          {THEMES.map(t => (
            <button
              key={t}
              type="button"
              className={theme === t ? 'active' : ''}
              aria-pressed={theme === t}
              onClick={() => setTheme(t)}
            >
              {t === 'system' ? 'System' : t === 'light' ? 'Light' : 'Dark'}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-row">
        <span className="settings-row-label">Inspection</span>
        <button
          type="button"
          role="switch"
          aria-checked={inspectionEnabled}
          aria-label="Inspection"
          className={`settings-switch ${inspectionEnabled ? 'on' : 'off'}`}
          onClick={() => setInspectionEnabled(!inspectionEnabled)}
        >
          {inspectionEnabled ? 'On' : 'Off'}
        </button>
      </div>

      <div className="settings-row">
        <span className="settings-row-label">Sound</span>
        <button
          type="button"
          role="switch"
          aria-checked={soundEnabled}
          aria-label="Sound"
          className={`settings-switch ${soundEnabled ? 'on' : 'off'}`}
          onClick={() => setSoundEnabled(!soundEnabled)}
        >
          {soundEnabled ? 'On' : 'Off'}
        </button>
      </div>

      <div className="settings-row settings-row-stack">
        <span className="settings-row-label">
          Hold-to-start delay <span className="settings-hold-value">{holdMs} ms</span>
        </span>
        <input
          type="range"
          min={0}
          max={1000}
          step={50}
          value={holdMs}
          aria-label="Hold-to-start delay milliseconds"
          onChange={e => setHoldMs(Number(e.target.value))}
        />
      </div>

      <div className="settings-row">
        <span className="settings-row-label">3D scramble preview</span>
        <button
          type="button"
          role="switch"
          aria-checked={previewEnabled}
          aria-label="3D scramble preview"
          className={`settings-switch ${previewEnabled ? 'on' : 'off'}`}
          onClick={() => setPreviewEnabled(!previewEnabled)}
        >
          {previewEnabled ? 'On' : 'Off'}
        </button>
      </div>

      {previewEnabled && (
        <div className="settings-row">
          <span className="settings-row-label">View mode</span>
          <div className="settings-segmented">
            <button
              type="button"
              className={previewMode === '3D' ? 'active' : ''}
              aria-pressed={previewMode === '3D'}
              onClick={() => setPreviewMode('3D')}
            >
              3D
            </button>
            <button
              type="button"
              className={previewMode === '2D' ? 'active' : ''}
              aria-pressed={previewMode === '2D'}
              onClick={() => setPreviewMode('2D')}
            >
              2D
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPanel;
```

- [ ] **Step 2: Add CSS for the new rows**

Append to `frontend/src/components/SettingsPanel.css`:

```css
.settings-row-stack {
  flex-direction: column;
  align-items: stretch;
  gap: 0.5rem;
}
.settings-row-stack input[type="range"] {
  width: 100%;
}
.settings-hold-value {
  margin-left: 0.5rem;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 3: Update Header.tsx to pass new props**

Inside `Header.tsx`, replace the destructure and the `<SettingsPanel>` JSX with:

```tsx
const {
  theme, setTheme,
  inspectionEnabled, setInspectionEnabled,
  soundEnabled, setSoundEnabled,
  holdMs, setHoldMs,
} = useSettings();
const { enabled, setEnabled, mode, setMode } = useScramblePreviewSettings();
```

```tsx
<SettingsPanel
  theme={theme}
  setTheme={setTheme}
  inspectionEnabled={inspectionEnabled}
  setInspectionEnabled={setInspectionEnabled}
  soundEnabled={soundEnabled}
  setSoundEnabled={setSoundEnabled}
  holdMs={holdMs}
  setHoldMs={setHoldMs}
  previewEnabled={enabled}
  setPreviewEnabled={setEnabled}
  previewMode={mode}
  setPreviewMode={setMode}
/>
```

- [ ] **Step 4: Update SettingsPanel tests**

Open `frontend/src/components/SettingsPanel.test.tsx` and add the following test inside the existing `describe`. (Keep the old tests, but update any that pass props — they all need the new required props. Use a `renderPanel` helper.)

```tsx
const baseProps = {
  theme: 'system' as const,
  setTheme: vi.fn(),
  inspectionEnabled: true,
  setInspectionEnabled: vi.fn(),
  soundEnabled: false,
  setSoundEnabled: vi.fn(),
  holdMs: 550,
  setHoldMs: vi.fn(),
  previewEnabled: true,
  setPreviewEnabled: vi.fn(),
  previewMode: '3D' as const,
  setPreviewMode: vi.fn(),
};

it('toggles inspection switch', () => {
  const setInspectionEnabled = vi.fn();
  render(<SettingsPanel {...baseProps} setInspectionEnabled={setInspectionEnabled} />);
  fireEvent.click(screen.getByRole('switch', { name: 'Inspection' }));
  expect(setInspectionEnabled).toHaveBeenCalledWith(false);
});

it('moves the hold-to-start slider', () => {
  const setHoldMs = vi.fn();
  render(<SettingsPanel {...baseProps} setHoldMs={setHoldMs} />);
  const slider = screen.getByLabelText('Hold-to-start delay milliseconds');
  fireEvent.change(slider, { target: { value: '0' } });
  expect(setHoldMs).toHaveBeenCalledWith(0);
});

it('selects System theme', () => {
  const setTheme = vi.fn();
  render(<SettingsPanel {...baseProps} setTheme={setTheme} />);
  fireEvent.click(screen.getByRole('button', { name: 'System' }));
  expect(setTheme).toHaveBeenCalledWith('system');
});
```

- [ ] **Step 5: Run tests + typecheck**

```bash
cd frontend && npx tsc --noEmit && npx vitest run src/components/SettingsPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/SettingsPanel.tsx \
        frontend/src/components/SettingsPanel.css \
        frontend/src/components/SettingsPanel.test.tsx \
        frontend/src/components/Header.tsx
git commit -m "expand settings panel with inspection, sound, hold-to-start"
```

---

## Task 7: Wire settings into Timer

**Files:**
- Modify: `frontend/src/components/Timer.tsx`

- [ ] **Step 1: Read settings inside Timer**

At the top of `Timer.tsx`, add the import and replace the constant `HOLD_MS` usage with a hook-driven value.

Replace lines 1–8 with:

```tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { formatTime } from '../utils/formatTime';
import { beep } from '../utils/sound';
import { useSettings } from '../hooks/useSettings';
import './Timer.css';

type Phase = 'idle' | 'ready' | 'inspection' | 'armed' | 'running';
```

- [ ] **Step 2: Use settings in Timer body**

Inside `Timer({ onSolveComplete })`, immediately after the existing `useState`/`useRef` declarations (after line ~37), add:

```tsx
const { holdMs, inspectionEnabled } = useSettings();
const holdMsRef = useRef(holdMs);
useEffect(() => { holdMsRef.current = holdMs; }, [holdMs]);
```

Then inside `beginHold`, replace `HOLD_MS` with `holdMsRef.current`:

```tsx
const beginHold = useCallback(() => {
  holdStartRef.current = Date.now();
  holdMetRef.current = false;
  setHoldMet(false);
  if (holdMetTimeoutRef.current !== null) clearTimeout(holdMetTimeoutRef.current);
  const delay = holdMsRef.current;
  if (delay === 0) {
    holdMetRef.current = true;
    setHoldMet(true);
  } else {
    holdMetTimeoutRef.current = setTimeout(() => {
      holdMetRef.current = true;
      setHoldMet(true);
    }, delay);
  }
}, []);
```

Delete the top-level `const HOLD_MS = 550;` line — it's no longer used.

- [ ] **Step 3: Branch on inspectionEnabled in onPressUp**

When inspection is off, `ready` should transition straight to `running` instead of starting an inspection countdown. Replace `onPressUp` with:

```tsx
const inspectionEnabledRef = useRef(inspectionEnabled);
useEffect(() => { inspectionEnabledRef.current = inspectionEnabled; }, [inspectionEnabled]);

const onPressUp = useCallback(() => {
  const p = phaseRef.current;
  if (p === 'ready') {
    const met = holdMetRef.current;
    clearHold();
    if (!met) {
      phaseRef.current = 'idle';
      setPhase('idle');
      return;
    }
    if (inspectionEnabledRef.current) startInspection();
    else {
      penaltyFlagsRef.current = { plusTwo: false, dnf: false };
      setTime(0);
      timeRef.current = 0;
      timerIntervalRef.current = setInterval(() => {
        setTime(prev => {
          const next = prev + 10;
          timeRef.current = next;
          return next;
        });
      }, 10);
      phaseRef.current = 'running';
      setPhase('running');
    }
  } else if (p === 'armed') {
    const met = holdMetRef.current;
    clearHold();
    if (met) startRunning();
    else {
      phaseRef.current = 'inspection';
      setPhase('inspection');
    }
  }
}, [clearHold, startInspection, startRunning]);
```

Place the two `useRef`/`useEffect` lines next to the `holdMsRef` block from Step 2.

- [ ] **Step 4: Manual smoke verification**

```bash
cd frontend && npm run dev
```

Open the app, open Settings, toggle Inspection off. Hold space → release after 550ms → timer starts immediately (no countdown). Toggle Inspection on, set Hold-to-start to 0, hold space → release immediately → inspection starts. Toggle Sound on, run an inspection past the 7-second mark → audible beep.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Timer.tsx
git commit -m "drive timer hold delay and inspection on/off from settings"
```

---

## Task 8: Make solve rows clickable

**Files:**
- Modify: `frontend/src/components/SolveLog.tsx`
- Modify: `frontend/src/components/SolveLog.css`

- [ ] **Step 1: Add onSolveClick prop**

In `SolveLog.tsx`, extend `SolveLogProps`:

```tsx
interface SolveLogProps {
  solves: Solve[];
  onSolveUpdate: (solve: Solve) => void;
  onSolveDelete: (solve: Solve) => void;
  onSolveClick: (solve: Solve, index: number) => void;
  onReset: () => void;
  onLoadMore: () => void;
  hasMore: boolean;
  isLoadingMore: boolean;
}
```

Destructure `onSolveClick` in the component params.

- [ ] **Step 2: Wrap row content in a clickable area**

Replace the `<li>` body (lines 92–124 in the current file). The action buttons must `stopPropagation` so they don't open the modal:

```tsx
<li key={solve.id} className="solve-log-item">
  <button
    type="button"
    className="solve-row-button"
    onClick={() => onSolveClick(solve, index)}
    aria-label={`Solve ${index + 1} details`}
  >
    <span className="solve-time">
      {solve.dnf
        ? 'DNF'
        : solve.plus_two
          ? `${formatTime(solve.time + 2)}+`
          : formatTime(solve.time)}
    </span>
    <span className="solve-ao5">
      {currentAo5 !== null ? `(${fmt(currentAo5)})` : ''}
    </span>
  </button>
  <div className="solve-actions" onClick={e => e.stopPropagation()}>
    <button
      onClick={() => onSolveUpdate({ ...solve, dnf: !solve.dnf })}
      className={`dnf-button ${solve.dnf ? 'active' : ''}`}
    >
      DNF
    </button>
    <button
      onClick={() => onSolveUpdate({ ...solve, plus_two: !solve.plus_two })}
      className={`plus_two-button ${solve.plus_two ? 'active' : ''}`}
    >
      +2
    </button>
    <button
      onClick={() => onSolveDelete(solve)}
      className="delete-button"
      title="Delete solve"
    >
      ×
    </button>
  </div>
</li>
```

- [ ] **Step 3: Style the row button to look like the row used to**

Append to `frontend/src/components/SolveLog.css`:

```css
.solve-row-button {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: none;
  border: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  padding: 0;
}
.solve-row-button:hover {
  color: var(--color-text);
}
```

- [ ] **Step 4: Commit (will hook up consumer in Task 9 / 11)**

```bash
git add frontend/src/components/SolveLog.tsx frontend/src/components/SolveLog.css
git commit -m "make solve log rows clickable for detail view"
```

---

## Task 9: SolveDetailModal — write tests

**Files:**
- Create: `frontend/src/components/SolveDetailModal.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SolveDetailModal from './SolveDetailModal';
import type { Solve } from '../types';

const mkSolve = (overrides: Partial<Solve> = {}): Solve => ({
  id: 'id-x',
  puzzle_type: '333',
  time: 23.45,
  dnf: false,
  plus_two: false,
  scramble: "R U R' U' F2",
  created_at: '2026-04-12T15:30:00.000Z',
  ...overrides,
});

const five = [
  mkSolve({ id: '1', time: 21.10 }),
  mkSolve({ id: '2', time: 23.45 }),
  mkSolve({ id: '3', time: 19.87 }),
  mkSolve({ id: '4', time: 25.02 }),
  mkSolve({ id: '5', time: 22.18 }),
];

describe('SolveDetailModal', () => {
  it('renders the focused solve time large', () => {
    render(<SolveDetailModal solve={five[2]} window={five} index={2}
      onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByTestId('solve-detail-time').textContent).toBe('19.87');
  });

  it('renders the ±2 ao5 window with the focused solve marked', () => {
    render(<SolveDetailModal solve={five[2]} window={five} index={2}
      onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    const focused = screen.getByTestId('ao5-focused');
    expect(focused.textContent).toBe('19.87');
    // ao5 = drop fastest (19.87) and slowest (25.02), mean of 21.10, 23.45, 22.18 = 22.243...
    expect(screen.getByTestId('ao5-value').textContent).toBe('22.24');
  });

  it('falls back gracefully when fewer than 5 surrounding solves exist', () => {
    render(<SolveDetailModal solve={five[0]} window={five.slice(0, 2)} index={0}
      onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByTestId('ao5-value').textContent).toBe('-');
  });

  it('toggles +2 and DNF', () => {
    const onUpdate = vi.fn();
    render(<SolveDetailModal solve={five[2]} window={five} index={2}
      onClose={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '+2' }));
    expect(onUpdate).toHaveBeenCalledWith({ ...five[2], plus_two: true });
    fireEvent.click(screen.getByRole('button', { name: 'DNF' }));
    expect(onUpdate).toHaveBeenCalledWith({ ...five[2], dnf: true });
  });

  it('calls onDelete then onClose when Delete clicked', () => {
    const onClose = vi.fn();
    const onDelete = vi.fn();
    render(<SolveDetailModal solve={five[2]} window={five} index={2}
      onClose={onClose} onUpdate={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith(five[2]);
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<SolveDetailModal solve={five[2]} window={five} index={2}
      onClose={onClose} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('copies the scramble to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<SolveDetailModal solve={five[2]} window={five} index={2}
      onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /copy scramble/i }));
    expect(writeText).toHaveBeenCalledWith("R U R' U' F2");
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd frontend && npx vitest run src/components/SolveDetailModal.test.tsx
```

Expected: FAIL with "Cannot find module './SolveDetailModal'".

---

## Task 10: SolveDetailModal — implementation

**Files:**
- Create: `frontend/src/components/SolveDetailModal.tsx`
- Create: `frontend/src/components/SolveDetailModal.css`

- [ ] **Step 1: Implement component**

```tsx
import React, { useEffect, useState } from 'react';
import { formatTime } from '../utils/formatTime';
import type { Solve } from '../types';
import './SolveDetailModal.css';

interface SolveDetailModalProps {
  solve: Solve;
  window: Solve[];        // up to 5 solves: focus + 2 neighbors on each side
  index: number;          // index of `solve` within `window`
  onClose: () => void;
  onUpdate: (solve: Solve) => void;
  onDelete: (solve: Solve) => void;
}

const effectiveTime = (s: Solve): number =>
  s.dnf ? Number.POSITIVE_INFINITY : s.plus_two ? s.time + 2 : s.time;

const computeAo5 = (window: Solve[]): number | null => {
  if (window.length < 5) return null;
  const times = window.slice(0, 5).map(effectiveTime);
  const dnfs = times.filter(t => t === Number.POSITIVE_INFINITY).length;
  if (dnfs > 1) return null;
  const sorted = [...times].sort((a, b) => a - b).slice(1, -1);
  if (sorted.some(t => t === Number.POSITIVE_INFINITY)) return null;
  return sorted.reduce((a, b) => a + b, 0) / sorted.length;
};

const formatLabel = (s: Solve): string =>
  s.dnf ? 'DNF' : s.plus_two ? `${formatTime(s.time + 2)}+` : formatTime(s.time);

const SolveDetailModal = ({
  solve, window: solveWindow, index, onClose, onUpdate, onDelete,
}: SolveDetailModalProps): React.ReactElement => {
  const [copied, setCopied] = useState(false);
  const ao5 = computeAo5(solveWindow);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copyScramble = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(solve.scramble);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — clipboard failures are not fatal
    }
  };

  const handleDelete = (): void => {
    onDelete(solve);
    onClose();
  };

  const date = new Date(solve.created_at);
  const dateStr = date.toLocaleString();

  return (
    <div className="solve-detail-backdrop" onClick={onClose}>
      <div
        className="solve-detail-modal"
        role="dialog"
        aria-label="Solve details"
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          className="solve-detail-close"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>

        <div className="solve-detail-time" data-testid="solve-detail-time">
          {solve.dnf ? 'DNF' : formatTime(solve.plus_two ? solve.time + 2 : solve.time)}
        </div>
        <div className="solve-detail-date">{dateStr}</div>

        <div className="solve-detail-section">
          <div className="solve-detail-label">Scramble</div>
          <div className="solve-detail-scramble">
            <code>{solve.scramble || '—'}</code>
            <button
              type="button"
              onClick={copyScramble}
              disabled={!solve.scramble}
              aria-label="Copy scramble"
            >
              {copied ? 'Copied' : 'Copy scramble'}
            </button>
          </div>
        </div>

        <div className="solve-detail-section">
          <div className="solve-detail-label">±2 ao5 context</div>
          <div className="solve-detail-window">
            {solveWindow.map((s, i) => (
              <span
                key={s.id}
                className={`ao5-cell${i === index ? ' focused' : ''}`}
                data-testid={i === index ? 'ao5-focused' : undefined}
              >
                {formatLabel(s)}
              </span>
            ))}
          </div>
          <div className="solve-detail-ao5">
            ao5: <span data-testid="ao5-value">{ao5 === null ? '-' : formatTime(ao5)}</span>
          </div>
        </div>

        <div className="solve-detail-actions">
          <button
            type="button"
            className={`detail-toggle ${solve.plus_two ? 'active' : ''}`}
            onClick={() => onUpdate({ ...solve, plus_two: !solve.plus_two })}
          >
            +2
          </button>
          <button
            type="button"
            className={`detail-toggle ${solve.dnf ? 'active' : ''}`}
            onClick={() => onUpdate({ ...solve, dnf: !solve.dnf })}
          >
            DNF
          </button>
          <button
            type="button"
            className="detail-delete"
            onClick={handleDelete}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

export default SolveDetailModal;
```

- [ ] **Step 2: Add CSS**

```css
.solve-detail-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.solve-detail-modal {
  position: relative;
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  padding: 1.5rem 1.75rem;
  min-width: min(28rem, 90vw);
  max-width: 36rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.solve-detail-close {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 1.25rem;
  cursor: pointer;
}
.solve-detail-time {
  font-size: 2.5rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.solve-detail-date {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}
.solve-detail-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.solve-detail-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}
.solve-detail-scramble {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.solve-detail-scramble code {
  flex: 1;
  font-family: var(--font-mono, ui-monospace, monospace);
  background: var(--color-panel);
  padding: 0.5rem 0.75rem;
  border-radius: 0.375rem;
  word-break: break-word;
}
.solve-detail-window {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  font-variant-numeric: tabular-nums;
}
.ao5-cell {
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  background: var(--color-panel);
  color: var(--color-text-muted);
}
.ao5-cell.focused {
  background: var(--color-orange, #c87a2c);
  color: var(--color-text);
  font-weight: 700;
}
.solve-detail-ao5 {
  font-variant-numeric: tabular-nums;
}
.solve-detail-actions {
  display: flex;
  gap: 0.5rem;
}
.detail-toggle.active {
  background: var(--color-orange, #c87a2c);
  color: var(--color-text);
}
.detail-delete {
  margin-left: auto;
  background: var(--color-red, #b91c1c);
  color: white;
  border: none;
  border-radius: 0.375rem;
  padding: 0.4rem 0.75rem;
  cursor: pointer;
}
```

- [ ] **Step 3: Run tests**

```bash
cd frontend && npx vitest run src/components/SolveDetailModal.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/SolveDetailModal.tsx \
        frontend/src/components/SolveDetailModal.css \
        frontend/src/components/SolveDetailModal.test.tsx
git commit -m "add SolveDetailModal with ao5 context, copy, penalty toggles"
```

---

## Task 11: Wire SolveDetailModal into SolveSession

**Files:**
- Modify: `frontend/src/components/SolveSession.tsx`

- [ ] **Step 1: Add import + modal state**

At the top, add:

```tsx
import SolveDetailModal from './SolveDetailModal';
```

Inside `SolveSession`, after the existing `useState` declarations, add:

```tsx
const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
```

Build the ±2 window using the current `solves` array (newest-first). Add (just above the `return`):

```tsx
const selectedSolve = selectedIndex !== null ? solves[selectedIndex] ?? null : null;
const detailWindow = selectedIndex === null ? [] : (() => {
  const lo = Math.max(0, selectedIndex - 2);
  const hi = Math.min(solves.length, selectedIndex + 3);
  return solves.slice(lo, hi);
})();
const detailWindowIndex = selectedIndex === null ? 0 : selectedIndex - Math.max(0, selectedIndex - 2);
```

- [ ] **Step 2: Pass onSolveClick to SolveLog**

Update the `<SolveLog>` JSX to add `onSolveClick={(_, idx) => setSelectedIndex(idx)}`.

- [ ] **Step 3: Render the modal at the bottom of SolveSession**

Just before the closing `</div>` of `.solve-session`, add:

```tsx
{selectedSolve && (
  <SolveDetailModal
    solve={selectedSolve}
    window={detailWindow}
    index={detailWindowIndex}
    onClose={() => setSelectedIndex(null)}
    onUpdate={s => { handleSolveUpdate(s); setSelectedIndex(null); }}
    onDelete={s => handleSolveDelete(s)}
  />
)}
```

- [ ] **Step 4: Manual smoke**

```bash
cd frontend && npm run dev
```

Click any solve row → modal opens with the time, date, scramble, ±2 window with that row visually focused, and the computed ao5. Click Copy scramble → "Copied" appears. Click +2 → row updates, modal closes. Click Delete → row vanishes, modal closes; refresh → row stays gone.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SolveSession.tsx
git commit -m "open SolveDetailModal on row click with surrounding ao5 window"
```

---

## Task 12: useHotkeys — write tests

**Files:**
- Create: `frontend/src/hooks/useHotkeys.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import useHotkeys, { HotkeyMap } from './useHotkeys';

const Harness = ({ map, enabled = true }: { map: HotkeyMap; enabled?: boolean }): JSX.Element => {
  useHotkeys(map, enabled);
  return <input data-testid="input" />;
};

describe('useHotkeys', () => {
  it('fires the matching handler on keydown', () => {
    const onTwo = vi.fn();
    render(<Harness map={{ '2': onTwo }} />);
    fireEvent.keyDown(window, { key: '2' });
    expect(onTwo).toHaveBeenCalled();
  });

  it('does NOT fire when an input is focused', () => {
    const onTwo = vi.fn();
    const { getByTestId } = render(<Harness map={{ '2': onTwo }} />);
    (getByTestId('input') as HTMLInputElement).focus();
    fireEvent.keyDown(window, { key: '2', target: getByTestId('input') });
    expect(onTwo).not.toHaveBeenCalled();
  });

  it('matches Shift+D distinctly from d', () => {
    const onD = vi.fn();
    const onShiftD = vi.fn();
    render(<Harness map={{ 'd': onD, 'Shift+d': onShiftD }} />);
    fireEvent.keyDown(window, { key: 'd' });
    fireEvent.keyDown(window, { key: 'D', shiftKey: true });
    expect(onD).toHaveBeenCalledTimes(1);
    expect(onShiftD).toHaveBeenCalledTimes(1);
  });

  it('does nothing when disabled', () => {
    const onTwo = vi.fn();
    render(<Harness map={{ '2': onTwo }} enabled={false} />);
    fireEvent.keyDown(window, { key: '2' });
    expect(onTwo).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd frontend && npx vitest run src/hooks/useHotkeys.test.tsx
```

Expected: FAIL with "Cannot find module './useHotkeys'".

---

## Task 13: useHotkeys — implementation

**Files:**
- Create: `frontend/src/hooks/useHotkeys.ts`

- [ ] **Step 1: Implement hook**

```ts
import { useEffect, useRef } from 'react';

export type HotkeyHandler = (e: KeyboardEvent) => void;
export type HotkeyMap = Record<string, HotkeyHandler>;

const isEditableTarget = (t: EventTarget | null): boolean => {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (t.isContentEditable) return true;
  return false;
};

const buildKey = (e: KeyboardEvent): string => {
  // Normalise: "d" lowercase, "Shift+D" form when shift held + alpha key.
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.metaKey) parts.push('Meta');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  parts.push(k);
  return parts.join('+');
};

const useHotkeys = (map: HotkeyMap, enabled: boolean = true): void => {
  const mapRef = useRef(map);
  useEffect(() => { mapRef.current = map; }, [map]);

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent): void => {
      if (isEditableTarget(e.target)) return;
      const combo = buildKey(e);
      const fn = mapRef.current[combo];
      if (fn) {
        e.preventDefault();
        fn(e);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled]);
};

export default useHotkeys;
```

- [ ] **Step 2: Run tests**

```bash
cd frontend && npx vitest run src/hooks/useHotkeys.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useHotkeys.ts frontend/src/hooks/useHotkeys.test.tsx
git commit -m "add useHotkeys with input-aware filtering and modifier keys"
```

---

## Task 14: HotkeyHelp overlay component

**Files:**
- Create: `frontend/src/components/HotkeyHelp.tsx`
- Create: `frontend/src/components/HotkeyHelp.css`

- [ ] **Step 1: Implement overlay**

```tsx
import React, { useEffect } from 'react';
import './HotkeyHelp.css';

interface HotkeyHelpProps {
  onClose: () => void;
}

const ENTRIES: Array<[string, string]> = [
  ['Space', 'Hold to start (inspection or solve)'],
  ['Esc', 'Cancel pending timer / close modal'],
  ['2', 'Toggle +2 on most recent solve'],
  ['d', 'Toggle DNF on most recent solve'],
  ['Shift+D', 'Delete most recent solve (with confirm)'],
  ['?', 'Show this help'],
];

const HotkeyHelp = ({ onClose }: HotkeyHelpProps): React.ReactElement => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="hotkey-help-backdrop" onClick={onClose}>
      <div
        className="hotkey-help-modal"
        role="dialog"
        aria-label="Keyboard shortcuts"
        onClick={e => e.stopPropagation()}
      >
        <h2>Keyboard shortcuts</h2>
        <ul>
          {ENTRIES.map(([key, desc]) => (
            <li key={key}>
              <kbd>{key}</kbd>
              <span>{desc}</span>
            </li>
          ))}
        </ul>
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </div>
  );
};

export default HotkeyHelp;
```

- [ ] **Step 2: CSS**

```css
.hotkey-help-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 110;
}
.hotkey-help-modal {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  padding: 1.5rem;
  min-width: min(24rem, 90vw);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.hotkey-help-modal ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  row-gap: 0.5rem;
  column-gap: 1rem;
}
.hotkey-help-modal li {
  display: contents;
}
.hotkey-help-modal kbd {
  font-family: var(--font-mono, ui-monospace, monospace);
  background: var(--color-panel);
  border-radius: 0.25rem;
  padding: 0.1rem 0.4rem;
  font-size: 0.875rem;
}
.hotkey-help-modal button {
  align-self: flex-end;
}
```

- [ ] **Step 3: Commit (consumer in next task)**

```bash
git add frontend/src/components/HotkeyHelp.tsx frontend/src/components/HotkeyHelp.css
git commit -m "add HotkeyHelp overlay listing keyboard shortcuts"
```

---

## Task 15: Mount hotkeys in SolveSession

**Files:**
- Modify: `frontend/src/components/SolveSession.tsx`

- [ ] **Step 1: Add imports and state**

```tsx
import useHotkeys from '../hooks/useHotkeys';
import HotkeyHelp from './HotkeyHelp';
```

Inside `SolveSession`, alongside existing `useState`:

```tsx
const [helpOpen, setHelpOpen] = useState(false);
```

- [ ] **Step 2: Build the hotkey map**

Just above the `return`, add:

```tsx
const mostRecent = solves[0] ?? null;

useHotkeys(
  {
    '2': () => {
      if (mostRecent) handleSolveUpdate({ ...mostRecent, plus_two: !mostRecent.plus_two });
    },
    'd': () => {
      if (mostRecent) handleSolveUpdate({ ...mostRecent, dnf: !mostRecent.dnf });
    },
    'Shift+d': () => {
      if (mostRecent && window.confirm('Delete most recent solve?')) {
        handleSolveDelete(mostRecent);
      }
    },
    '?': () => setHelpOpen(true),
    'Shift+?': () => setHelpOpen(true), // some keyboards report Shift with ?
  },
  selectedIndex === null && !helpOpen, // disabled while a modal is open
);
```

The Timer already handles its own Space/Escape inside `Timer.tsx` (lines 209–237) — we don't need to duplicate those here, and they're not in the global map.

- [ ] **Step 3: Render the help overlay**

Below the `SolveDetailModal` render block, add:

```tsx
{helpOpen && <HotkeyHelp onClose={() => setHelpOpen(false)} />}
```

- [ ] **Step 4: Manual smoke**

```bash
cd frontend && npm run dev
```

Press `?` → help overlay shows, lists shortcuts, Esc closes. Run a solve, press `2` → row gets `+2`. Press `d` → row toggles DNF. Press `Shift+D` → confirm → row deletes. Open the SolveDetailModal → press `2` → nothing happens (correctly disabled while modal is open).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SolveSession.tsx
git commit -m "wire global hotkeys for penalty toggles, delete, and help overlay"
```

---

## Task 16: Final acceptance pass

- [ ] **Step 1: Run the full test suite + typecheck**

```bash
cd frontend && npx tsc --noEmit && npx vitest run
```

Expected: all green.

- [ ] **Step 2: Walk the Phase 5 acceptance criteria from `revamp.md`**

Manually verify each item against a running `npm run dev` instance:

1. Soft-deleting a solve removes it from the log; row remains in Supabase with `deleted_at` set.
2. Re-fetching solves does not resurrect deleted ones.
3. Clicking any solve row opens the detail modal with correct ao5 context and neighbor solves.
4. With Inspection toggled off in Settings: keydown → ready → (hold delay) → keyup → running.
5. Settings persist across page refreshes (check localStorage `decipher.settings`).
6. Pressing `?` opens the hotkey overlay.

- [ ] **Step 3: If anything fails, fix in-place and re-run Step 1**

- [ ] **Step 4: Final commit if any cleanup was needed**

```bash
git add -A
git commit -m "phase 5 acceptance polish"
```
