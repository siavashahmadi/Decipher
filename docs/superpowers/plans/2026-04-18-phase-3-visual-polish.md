# Phase 3: Visual Polish & Responsive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the visual rough edges from the current dark-only theme: consolidate every hardcoded color into CSS variables, add a working light theme, fix the undefined active-tab style, introduce a three-tier responsive puzzle selector, and replace the default-CRA atom logo with a typographic mark.

**Architecture:** All colors move to `:root` custom properties on `<html>`, overridden by a `[data-theme="light"]` block. A `ThemeProvider` React context owns the current theme value, syncs it to `localStorage.decipher.theme`, and writes `document.documentElement.dataset.theme` so CSS flips. Recharts cannot consume CSS variables, so JS-side chart colors live in a small `themeColors` map keyed by theme. All component-level CSS files become token-only (no hex literals). Responsive tiers are pure CSS — both `.puzzle-buttons` (tabs/chips) and `.puzzle-select` (dropdown) stay rendered; the breakpoint decides which one is visible.

**Tech Stack:** React 18, TypeScript strict, Vite 5, Recharts (unchanged). No new dependencies.

---

## Context

**Current state (verified 2026-04-18):**
- `frontend/src/index.css` defines 14 tokens in `:root` (dark only).
- Hardcoded hex scattered across `Header.css` (8), `SolveLog.css` (6), `Auth.css` (1), and `SolveHub.tsx` Recharts attrs (6 usages of `#e4e4e4`, `#3dc942`, `#f5a623`).
- `Header.css` has a single `@media (max-width: 1024px)` that flips tabs → dropdown — no middle tier.
- `SolveSession.css` line 24 has `.timer-section { width: calc(100% + 3rem); }` — the documented "overflow hack".
- `SolveLog.tsx` has `<button className="reset-button">Reset Session</button>` at the top of the log. The confirm dialog in `SolveSession.tsx:282` reads `'Clear Session View? All times will be saved.'`.
- `Scramble.tsx:24` renders the scramble inside `<h2 className="scramble-text ...">`.
- `logo.svg` is imported by `Header.tsx:3` and `Auth.tsx:3`.
- `package.json` `"name"` is already `"decipher"` — nothing to change there.
- Root `README.md` title is `# Ao5 — Speedcubing Timer`.

**Files created this phase:**
- `frontend/src/hooks/useTheme.tsx` — ThemeProvider context + `useTheme` hook.
- `frontend/src/hooks/useTheme.test.tsx` — hook unit tests.
- `frontend/src/utils/themeColors.ts` — JS-side Recharts palette keyed by theme.

**Files modified this phase:**
- `frontend/src/index.css` — expand dark tokens, add light overrides.
- `frontend/src/main.tsx` — wrap App in ThemeProvider.
- `frontend/src/components/Header.tsx` — drop logo image, add theme toggle, select visible only < 640px.
- `frontend/src/components/Header.css` — swap hex for tokens, active-tab style, three-tier breakpoints, toggle button styles.
- `frontend/src/components/Auth.tsx` — drop logo image.
- `frontend/src/components/Auth.css` — swap hex for tokens.
- `frontend/src/components/SolveLog.tsx` — move/rename reset button, new dialog text lives in SolveSession.
- `frontend/src/components/SolveLog.css` — swap hex for tokens, style the moved button.
- `frontend/src/components/SolveHub.tsx` — Recharts colors via `useTheme` + themeColors map.
- `frontend/src/components/SolveSession.tsx` — update confirm-dialog text.
- `frontend/src/components/SolveSession.css` — remove the `calc(100% + 3rem)` hack.
- `frontend/src/components/Scramble.tsx` — `<h2>` → `<div>`.
- `README.md` — title change to `# Decipher (Ao5)`.

**Files deleted this phase:**
- `frontend/src/logo.svg`

---

## Task 1: Write failing test for `useTheme` hook

**Files:**
- Test: `frontend/src/hooks/useTheme.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/hooks/useTheme.test.tsx` with:

```tsx
import { act, render, renderHook, screen } from '@testing-library/react';
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
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd frontend && npx vitest run src/hooks/useTheme.test.tsx`
Expected: FAIL with "Cannot find module './useTheme'" or equivalent import error.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useTheme.test.tsx
git commit -m "test: add useTheme hook tests"
```

---

## Task 2: Implement `useTheme` hook and `ThemeProvider`

**Files:**
- Create: `frontend/src/hooks/useTheme.tsx`

- [ ] **Step 1: Implement the hook and provider**

Create `frontend/src/hooks/useTheme.tsx` with:

```tsx
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'decipher.theme';

const getInitialTheme = (): Theme => {
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  return prefersLight ? 'light' : 'dark';
};

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider = ({ children }: ThemeProviderProps): React.ReactElement => {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => setThemeState(next), []);
  const toggle = useCallback(
    () => setThemeState(prev => (prev === 'dark' ? 'light' : 'dark')),
    [],
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
};
```

- [ ] **Step 2: Run tests and verify all pass**

Run: `cd frontend && npx vitest run src/hooks/useTheme.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useTheme.tsx
git commit -m "feat: add ThemeProvider and useTheme hook"
```

---

## Task 3: Mount `ThemeProvider` at app root

**Files:**
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: Wrap `<App />` in `<ThemeProvider>`**

Replace the contents of `frontend/src/main.tsx` with:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { ThemeProvider } from './hooks/useTheme';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 2: Verify the app still mounts**

Run: `cd frontend && npm run dev`
Open `http://localhost:5173`.
Expected: the app loads unchanged. Open DevTools → Elements → inspect `<html>`. It should have `data-theme="dark"` (or `"light"` if system prefers light).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/main.tsx
git commit -m "feat: mount ThemeProvider at app root"
```

---

## Task 4: Expand dark-theme tokens in `index.css`

**Files:**
- Modify: `frontend/src/index.css`

Every hardcoded hex color used in a component `.css` file needs a named token so the light-theme override can flip it. This task only adds tokens — no component CSS changes yet, so the visual result should be identical.

- [ ] **Step 1: Rewrite the `:root` block**

Replace lines 1–16 of `frontend/src/index.css` with:

```css
:root {
  /* Surfaces */
  --color-bg:                  #282c34;
  --color-panel:               #374050;
  --color-surface:             #2c323c;
  --color-surface-hover:       #374151;

  /* Borders & dividers */
  --color-border:              #60678d;
  --color-border-hover:        #7a82aa;
  --color-row-border:          #646464;

  /* Text */
  --color-text:                #e4e4e4;
  --color-text-muted:          #a0a0a0;
  --color-text-secondary:      #757575;
  --color-text-inverse:        #ffffff;

  /* States / accents */
  --color-green:               #3dc942;
  --color-red:                 #ef4444;
  --color-orange:              #f5a623;
  --color-yellow:              #facc15;

  /* Semantic accents */
  --color-blue-bg:             #1e3a5f;
  --color-blue-border:         #2563eb;
  --color-blue-text:           #60a5fa;
  --color-destructive-bg:      #dc2626;
  --color-destructive-bg-hover: #b91c1c;

  /* Utility */
  --color-neutral-bg:          #6b7280;
  --color-row-hover-bg:        #1b2a48;
  --color-overlay-subtle:      #ffffff0c;
  --color-overlay-light:       #ffffff98;
  --color-title-underline:     #a9aaac;
  --color-focus-ring:          rgba(255, 255, 255, 0.15);
}
```

Note: `--color-panel` changes from `rgb(55, 64, 80)` to the equivalent `#374050` for format consistency. All other existing tokens keep their original values.

- [ ] **Step 2: Update `button:focus` to use `--color-focus-ring`**

In the same file, find:

```css
button:focus {
  outline: none;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.15);
}
```

Replace with:

```css
button:focus {
  outline: none;
  box-shadow: 0 0 0 2px var(--color-focus-ring);
}
```

- [ ] **Step 3: Verify no visual change**

Run: `cd frontend && npm run dev`
Expected: the app renders identically to before. All colors are unchanged because every new token aliases the same hex that was there.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/index.css
git commit -m "refactor: expand dark-theme tokens in index.css"
```

---

## Task 5: Replace hardcoded hex in `Header.css` with tokens

**Files:**
- Modify: `frontend/src/components/Header.css`

- [ ] **Step 1: Replace the hardcoded colors**

Apply these edits to `frontend/src/components/Header.css`:

Change line 6 from:
```css
  color: #fff;
```
to:
```css
  color: var(--color-text);
```

Change line 21 from:
```css
  text-decoration-color: #a9aaac;
```
to:
```css
  text-decoration-color: var(--color-title-underline);
```

Change line 32 from:
```css
  background-color: #ffffff0c;
```
to:
```css
  background-color: var(--color-overlay-subtle);
```

Change line 44 from:
```css
  background-color: #ffffff98;
```
to:
```css
  background-color: var(--color-overlay-light);
```

Change line 54 from:
```css
  color: #fff;
```
to:
```css
  color: var(--color-text);
```

Change line 65 from:
```css
  border-color: #5b5b5b;
```
to:
```css
  border-color: var(--color-border-hover);
```

Change line 78 from:
```css
  background-color: #dc2626;
```
to:
```css
  background-color: var(--color-destructive-bg);
```

Change line 86 from:
```css
  background-color: #b91c1c;
```
to:
```css
  background-color: var(--color-destructive-bg-hover);
```

- [ ] **Step 2: Verify the header looks identical**

Run: `cd frontend && npm run dev`
Expected: header still renders with the same colors. Sign In and Logout buttons look unchanged. Puzzle-select dropdown (if narrow viewport) looks unchanged.

- [ ] **Step 3: Audit no hex remains**

Run: `grep -nE '#[0-9a-fA-F]{3,8}' frontend/src/components/Header.css`
Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Header.css
git commit -m "refactor: move Header.css colors to tokens"
```

---

## Task 6: Replace hardcoded hex in `SolveLog.css` with tokens

**Files:**
- Modify: `frontend/src/components/SolveLog.css`

- [ ] **Step 1: Replace the hardcoded colors**

Apply these edits to `frontend/src/components/SolveLog.css`:

Change line 53 from:
```css
  color: #ffffff;
```
to:
```css
  color: var(--color-text);
```

Change line 67 from:
```css
  border-bottom: 1px solid #646464;
```
to:
```css
  border-bottom: 1px solid var(--color-row-border);
```

Change line 77 from:
```css
  color: #757575;
```
to:
```css
  color: var(--color-text-secondary);
```

Change line 110 from:
```css
  background-color: #1b2a48;
```
to:
```css
  background-color: var(--color-row-hover-bg);
```

Change line 119 from:
```css
  background: #6b7280;
```
to:
```css
  background: var(--color-neutral-bg);
```

Change line 145 from:
```css
  background: #374151;
```
to:
```css
  background: var(--color-surface-hover);
```

Leave the `rgba(0, 0, 0, 0.1)` box-shadow at line 40 alone — shadows aren't colors that need to flip.

- [ ] **Step 2: Audit no hex remains**

Run: `grep -nE '#[0-9a-fA-F]{3,8}' frontend/src/components/SolveLog.css`
Expected: no matches.

- [ ] **Step 3: Visual verify**

Run: `cd frontend && npm run dev`
Log a few solves. The solve rows, DNF/+2/delete buttons, load-more button should all look identical.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/SolveLog.css
git commit -m "refactor: move SolveLog.css colors to tokens"
```

---

## Task 7: Replace hardcoded hex in `Auth.css` with tokens

**Files:**
- Modify: `frontend/src/components/Auth.css`

- [ ] **Step 1: Replace the hardcoded color**

Change line 54 of `frontend/src/components/Auth.css` from:
```css
  background-color: #ffffff98;
```
to:
```css
  background-color: var(--color-overlay-light);
```

Leave the `rgba(0, 0, 0, 0.1)` box-shadow at line 69 alone.

- [ ] **Step 2: Audit no hex remains**

Run: `grep -nE '#[0-9a-fA-F]{3,8}' frontend/src/components/Auth.css`
Expected: no matches.

- [ ] **Step 3: Audit the rest of `components/`**

Run: `grep -rnE '#[0-9a-fA-F]{3,8}' frontend/src/components/ --include='*.css'`
Expected: only the `--color-yellow, #facc15` fallback and `--color-text-inverse, #fff` fallback in `Timer.css` remain (these are `var()` defaults, acceptable). No raw hex literals elsewhere.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Auth.css
git commit -m "refactor: move Auth.css colors to tokens"
```

---

## Task 8: Add `[data-theme="light"]` token overrides

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Append the light-theme block**

Append to `frontend/src/index.css` after the `:root { ... }` block (and before the `html` rule):

```css
[data-theme="light"] {
  /* Surfaces */
  --color-bg:                  #f7f7f5;
  --color-panel:               #ececea;
  --color-surface:             #ffffff;
  --color-surface-hover:       #e5e5e5;

  /* Borders & dividers */
  --color-border:              #d1d1d1;
  --color-border-hover:        #b0b0b0;
  --color-row-border:          #e0e0e0;

  /* Text */
  --color-text:                #1a1a1a;
  --color-text-muted:          #6b6b6b;
  --color-text-secondary:      #8a8a8a;
  --color-text-inverse:        #ffffff;

  /* States / accents (deeper shades so they read on white) */
  --color-green:               #2ea934;
  --color-red:                 #dc2626;
  --color-orange:              #d48806;
  --color-yellow:              #eab308;

  /* Semantic accents */
  --color-blue-bg:             #dbeafe;
  --color-blue-border:         #2563eb;
  --color-blue-text:           #1d4ed8;
  --color-destructive-bg:      #dc2626;
  --color-destructive-bg-hover: #b91c1c;

  /* Utility */
  --color-neutral-bg:          #9ca3af;
  --color-row-hover-bg:        #eef2fb;
  --color-overlay-subtle:      #0000000c;
  --color-overlay-light:       #00000018;
  --color-title-underline:     #9a9a9a;
  --color-focus-ring:          rgba(0, 0, 0, 0.15);
}
```

- [ ] **Step 2: Test the override in DevTools**

Run: `cd frontend && npm run dev`
In DevTools, set `<html data-theme="light">`.
Expected: background flips to near-white, text flips to near-black, panels become light gray, the logout button stays red, green PBs stay green. Scroll the app, log a solve, open the Auth screen — every visible surface flips, nothing stays dark.

Return `data-theme` to `"dark"` and verify it flips back.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat: add light theme token overrides"
```

---

## Task 9: Themed Recharts colors via `themeColors` map

**Files:**
- Create: `frontend/src/utils/themeColors.ts`
- Modify: `frontend/src/components/SolveHub.tsx`

Recharts writes its color props directly onto SVG attributes, which ignore CSS custom properties. We keep a small JS-side palette map so chart colors track the theme.

- [ ] **Step 1: Create the palette module**

Create `frontend/src/utils/themeColors.ts` with:

```ts
import type { Theme } from '../hooks/useTheme';

export interface ChartColors {
  axis: string;
  recent: string;
  pb: string;
}

const palette: Record<Theme, ChartColors> = {
  dark: {
    axis:   '#e4e4e4',
    recent: '#3dc942',
    pb:     '#f5a623',
  },
  light: {
    axis:   '#1a1a1a',
    recent: '#2ea934',
    pb:     '#d48806',
  },
};

export const chartColors = (theme: Theme): ChartColors => palette[theme];
```

- [ ] **Step 2: Consume from `SolveHub.tsx`**

Open `frontend/src/components/SolveHub.tsx`. Add these imports at the top, next to the existing imports:

```tsx
import { useTheme } from '../hooks/useTheme';
import { chartColors } from '../utils/themeColors';
```

Inside the `SolveHub` component body (before the `return`), add:

```tsx
const { theme } = useTheme();
const colors = chartColors(theme);
```

Replace the recent-solves chart block (currently lines 146–161) with:

```tsx
{chartData.length > 1 && (
  <div className="chart-container">
    <ResponsiveContainer width="100%" height={150}>
      <LineChart data={chartData}>
        <XAxis dataKey="solve" stroke={colors.axis} tick={{ fill: colors.axis }} />
        <YAxis stroke={colors.axis} tick={{ fill: colors.axis }} />
        <Tooltip content={<CustomTooltip />} />
        <Line
          type="monotone"
          dataKey="time"
          stroke={colors.recent}
          strokeWidth={2}
          dot={{ r: 3, fill: colors.recent }}
        />
      </LineChart>
    </ResponsiveContainer>
  </div>
)}
```

Replace the PB progression chart block (currently lines 164–183) with:

```tsx
{pbChartData.length > 1 && (
  <div className="chart-container">
    <p className="chart-title">PB Progression</p>
    <ResponsiveContainer width="100%" height={150}>
      <LineChart data={pbChartData}>
        <XAxis dataKey="solve" stroke={colors.axis} tick={{ fill: colors.axis }} />
        <YAxis stroke={colors.axis} tick={{ fill: colors.axis }} />
        <Tooltip content={<PBTooltip />} />
        <Line
          type="monotone"
          dataKey="time"
          stroke={colors.pb}
          strokeWidth={2}
          dot={{ r: 3, fill: colors.pb }}
        />
      </LineChart>
    </ResponsiveContainer>
  </div>
)}
```

- [ ] **Step 3: Verify the charts re-theme**

Run: `cd frontend && npm run dev`. Log 2+ solves so the chart renders.
Toggle `<html data-theme>` between `"dark"` and `"light"` in DevTools.
Expected: axis labels, tick colors, and line stroke re-render for each theme with readable contrast. No React warnings in the console.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/utils/themeColors.ts frontend/src/components/SolveHub.tsx
git commit -m "feat: theme-aware Recharts colors in SolveHub"
```

---

## Task 10: Add theme toggle button to Header

**Files:**
- Modify: `frontend/src/components/Header.tsx`
- Modify: `frontend/src/components/Header.css`

- [ ] **Step 1: Add the toggle button in `Header.tsx`**

Open `frontend/src/components/Header.tsx`. Add to the imports at the top:

```tsx
import { useTheme } from '../hooks/useTheme';
```

Inside the `Header` component, above `const handleLogout`, add:

```tsx
const { theme, toggle } = useTheme();
```

In the JSX, directly before the `{isGuest ? (...) : (...)}` sign-in/logout block, insert:

```tsx
<button
  className="theme-toggle"
  onClick={toggle}
  aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
  title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
>
  {theme === 'dark' ? '☀' : '☾'}
</button>
```

The sign-in/logout button's `margin-left: auto` will still push the right-side cluster to the right; the toggle sits just before it.

- [ ] **Step 2: Add toggle styles to `Header.css`**

Append to `frontend/src/components/Header.css`:

```css
.theme-toggle {
  margin-left: auto;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background-color: var(--color-surface);
  color: var(--color-text);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  transition: background-color 0.2s, border-color 0.2s;
}

.theme-toggle:hover {
  background-color: var(--color-surface-hover);
  border-color: var(--color-border-hover);
}
```

Then, so the sign-in/logout button no longer fights `.theme-toggle` for the auto margin, change the two existing rules in `Header.css`:

Find:
```css
.logout-button {
  margin-left: auto;
```
Replace with:
```css
.logout-button {
  margin-left: 0.5rem;
```

Find:
```css
.sign-in-button {
  margin-left: auto;
```
Replace with:
```css
.sign-in-button {
  margin-left: 0.5rem;
```

- [ ] **Step 3: Verify toggle works**

Run: `cd frontend && npm run dev`. Click the toggle button.
Expected: theme flips end-to-end (background, text, panels, charts). Refresh the page — the chosen theme persists. Check DevTools: `<html data-theme>` matches the button state and `localStorage.decipher.theme` persists.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Header.tsx frontend/src/components/Header.css
git commit -m "feat: theme toggle button in Header"
```

---

## Task 11: Style the active puzzle tab

**Files:**
- Modify: `frontend/src/components/Header.css`

Currently `.puzzle-buttons .button.active` has no styles — the active tab is visually identical to the others. Fix.

- [ ] **Step 1: Add active / non-active styles**

Append to `frontend/src/components/Header.css`:

```css
.puzzle-buttons .button {
  padding: 6px 12px;
  border-radius: 6px;
  background-color: transparent;
  color: var(--color-text-muted);
  border: 1px solid transparent;
  border-bottom: 2px solid transparent;
  transition: color 0.15s, background-color 0.15s, border-color 0.15s;
}

.puzzle-buttons .button:hover {
  color: var(--color-text);
  background-color: var(--color-surface);
}

.puzzle-buttons .button.active {
  color: var(--color-text);
  background-color: var(--color-surface);
  border-bottom-color: var(--color-blue-border);
}

.puzzle-buttons .button.active:hover {
  background-color: var(--color-surface-hover);
}
```

- [ ] **Step 2: Verify visually**

Run: `cd frontend && npm run dev`.
Expected: the currently-selected puzzle tab has a filled surface background and a blue underline; non-active tabs have transparent backgrounds and hover to a visible surface. Flip themes and verify the underline stays visible in both.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Header.css
git commit -m "style: active and non-active puzzle tab states"
```

---

## Task 12: Three-tier responsive breakpoints for the puzzle selector

**Files:**
- Modify: `frontend/src/components/Header.css`

Current rules: `.puzzle-buttons` visible by default, `.puzzle-select` hidden, then at `max-width: 1024px` they swap. That's two tiers. We need three:

- `≥ 1024px`: full horizontal tabs.
- `640px–1023px`: compact horizontal scrolling chips with `scroll-snap`.
- `< 640px`: dropdown `<select>`.

No JS changes — both the tab-bar and the select stay rendered; CSS decides visibility.

- [ ] **Step 1: Replace the existing `@media (max-width: 1024px)` block**

In `frontend/src/components/Header.css`, find the existing responsive block (currently lines 106–117):

```css
/* Switch to dropdown on smaller screens */
@media (max-width: 1024px) {
  .puzzle-buttons {
    display: none;
  }

  .puzzle-select {
    display: block;
    padding: 8px;
    border-radius: 4px;
    margin-left: 1rem;
  }
}
```

Replace it with:

```css
/* Tier 2: tablet — compact horizontally-scrolling chips */
@media (max-width: 1023px) {
  .puzzle-buttons {
    flex: 1;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
    padding-bottom: 4px;
    /* Thin scrollbar visual tweak; harmless if the browser ignores it */
    scrollbar-width: thin;
  }

  .puzzle-buttons .button {
    flex: 0 0 auto;
    scroll-snap-align: start;
    padding: 6px 10px;
    font-size: 0.9rem;
  }
}

/* Tier 3: mobile — dropdown <select> */
@media (max-width: 639px) {
  .puzzle-buttons {
    display: none;
  }

  .puzzle-select {
    display: block;
    padding: 8px;
    border-radius: 4px;
    margin-left: 0.5rem;
  }
}
```

- [ ] **Step 2: Verify visually at three widths**

Run: `cd frontend && npm run dev`. Use DevTools Responsive mode.
- At 1400px: tabs in a row, no scroll.
- At 800px: chips in a single row; if the list is wider than the header, horizontal scroll works and snaps to each chip.
- At 500px: tabs hidden; `<select>` dropdown appears and functions.

Flip themes at each width — visuals stay correct.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Header.css
git commit -m "feat: three-tier responsive puzzle selector"
```

---

## Task 13: Remove the `.timer-section` overflow hack

**Files:**
- Modify: `frontend/src/components/SolveSession.css`

- [ ] **Step 1: Delete the bad width declaration**

In `frontend/src/components/SolveSession.css`, find lines 23–27:

```css
.timer-section {
  width: calc(100% + 3rem);
  position: relative;
  z-index: 1;
}
```

Replace with:

```css
.timer-section {
  width: 100%;
  position: relative;
  z-index: 1;
}
```

- [ ] **Step 2: Verify layout is unchanged**

Run: `cd frontend && npm run dev`. Resize across the three breakpoints.
Expected: the timer panel no longer bleeds outside the `.main-content` container. The overall layout still centers correctly and the timer stretches the full container width (not more).

If the removal exposes a second layout issue (e.g. the timer was relying on overflow to look big), reduce the `.main-content` horizontal padding or add `padding: 0 1rem` to `.timer-section` instead — but do NOT restore the `calc(100% + 3rem)` line.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/SolveSession.css
git commit -m "fix: remove timer-section overflow hack"
```

---

## Task 14: Rename "Reset Session" to "Clear View", move to bottom, update dialog

**Files:**
- Modify: `frontend/src/components/SolveLog.tsx`
- Modify: `frontend/src/components/SolveLog.css`
- Modify: `frontend/src/components/SolveSession.tsx`

The button currently sits at the top of the solve log and reads "Reset Session" — implying solves get deleted, which is misleading. Rename it, move it to the bottom of the log, and update the confirm text.

- [ ] **Step 1: Update the `SolveLog.tsx` button position and label**

Open `frontend/src/components/SolveLog.tsx`.

Delete the current button block (currently lines 69–74):

```tsx
<button
  onClick={onReset}
  className="reset-button"
>
  Reset Session
</button>
```

Then, at the end of the component's returned JSX — after the `{hasMore && (...)}` load-more block, just before the closing `</div>` of `.solve-log` — add:

```tsx
{solves.length > 0 && (
  <button
    onClick={onReset}
    className="clear-view-button"
  >
    Clear view
  </button>
)}
```

- [ ] **Step 2: Restyle the button in `SolveLog.css`**

Open `frontend/src/components/SolveLog.css`.

Delete the `.reset-button` / `.reset-button:hover` rules (currently lines 8–23):

```css
.reset-button {
  padding: 8px 12px;
  border: none;
  border-radius: 4px;
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
  align-self: center;
  margin-bottom: 1rem;
  transition: all 0.2s ease;
}

.reset-button:hover {
  background: var(--color-red);
  color: white;
}
```

Append in their place:

```css
.clear-view-button {
  align-self: center;
  margin-top: 0.75rem;
  padding: 4px 8px;
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  font-size: 0.8rem;
  cursor: pointer;
  transition: color 0.2s;
}

.clear-view-button:hover {
  color: var(--color-text);
  background: transparent;
}
```

- [ ] **Step 3: Update the confirm-dialog text in `SolveSession.tsx`**

In `frontend/src/components/SolveSession.tsx` line 282, change:

```tsx
if (window.confirm('Clear Session View? All times will be saved.')) {
```

to:

```tsx
if (window.confirm('Clear the current view? Your solves stay saved.')) {
```

- [ ] **Step 4: Audit that "Reset Session" is gone from the UI text**

Run: `grep -rn 'Reset Session' frontend/src`
Expected: no matches.

- [ ] **Step 5: Manual verify**

Run: `cd frontend && npm run dev`.
Expected: solve log now has no top button. After at least one solve is logged, a small "Clear view" text link appears at the bottom of the log. Clicking it shows the new dialog text; OK clears the on-screen log; reloading the page brings the solves back (they were not deleted).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/SolveLog.tsx frontend/src/components/SolveLog.css frontend/src/components/SolveSession.tsx
git commit -m "refactor: rename Reset Session to Clear view and move to bottom"
```

---

## Task 15: Change `<h2 class="scramble-text">` to `<div>`

**Files:**
- Modify: `frontend/src/components/Scramble.tsx`

The scramble string isn't a heading — it's content. Keeping it as an `<h2>` misleads assistive tech and screws with outline order once a `/stats` page with real headings lands in Phase 6.

- [ ] **Step 1: Change the element**

In `frontend/src/components/Scramble.tsx` line 24, change:

```tsx
<h2 className={`scramble-text ${scrambleSize}`}>{text}</h2>
```

to:

```tsx
<div className={`scramble-text ${scrambleSize}`}>{text}</div>
```

- [ ] **Step 2: Verify visually**

Run: `cd frontend && npm run dev`.
Expected: scramble renders identically (the `.scramble-text` CSS class is what drives size/spacing, not the tag). Inspect in DevTools — element is now `<div>`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Scramble.tsx
git commit -m "fix: scramble text is not a heading"
```

---

## Task 16: Replace the default-CRA logo with a typographic mark

**Files:**
- Modify: `frontend/src/components/Header.tsx`
- Modify: `frontend/src/components/Header.css`
- Modify: `frontend/src/components/Auth.tsx`
- Modify: `frontend/src/components/Auth.css`
- Delete: `frontend/src/logo.svg`

Per spec: drop the image, use "Ao5" text with distinctive typography.

- [ ] **Step 1: Drop the logo `<img>` and import from `Header.tsx`**

In `frontend/src/components/Header.tsx`:

Remove the import:
```tsx
import logo from '../logo.svg';
```

Replace the `<div className="title-container">...</div>` block (currently lines 45–50):

```tsx
<div className="title-container">
  <div className="header-logo">
    <img src={logo} alt="Ao5 Logo" />
  </div>
  <h1 className="title">Ao5</h1>
</div>
```

with:

```tsx
<div className="title-container">
  <h1 className="title">Ao5</h1>
</div>
```

- [ ] **Step 2: Retire the `.header-logo` styles and tune the title**

In `frontend/src/components/Header.css`, delete the three rules: `.header-logo` (lines 26–35), `.header-logo img` (lines 37–41), and `.header-logo:hover` (lines 43–45).

Then replace the existing `.title` rule (lines 17–24):

```css
.title {
  font-size: 2rem;
  text-decoration-line: underline;
  text-decoration-thickness: 2px;
  text-decoration-color: var(--color-title-underline);
  margin: 2px;
  min-width: fit-content;
}
```

with a sharper typographic mark:

```css
.title {
  font-size: 2rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  text-decoration-line: underline;
  text-decoration-thickness: 2px;
  text-decoration-color: var(--color-title-underline);
  text-underline-offset: 4px;
  margin: 2px;
  min-width: fit-content;
  color: var(--color-text);
}
```

- [ ] **Step 3: Drop the logo from `Auth.tsx`**

In `frontend/src/components/Auth.tsx`:

Remove the import:
```tsx
import logo from '../logo.svg';
```

Remove the `<img>` element (currently lines 55–59):

```tsx
<img
  src={logo}
  alt="Ao5 Logo"
  className="auth-logo"
/>
```

Add in its place:

```tsx
<h1 className="auth-logo-text">Ao5</h1>
```

- [ ] **Step 4: Replace the `.auth-logo` styles**

In `frontend/src/components/Auth.css`, delete the existing `.auth-logo` rule (lines 12–21):

```css
.auth-logo {
  width: 120px;
  height: 120px;
  margin-bottom: -30px;
  position: relative;
  z-index: 2;
  background-color: var(--color-bg);
  border-radius: 50%;
  padding: 8px;
}
```

Append in its place:

```css
.auth-logo-text {
  font-size: 3rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--color-text);
  margin: 0 0 1rem 0;
}
```

- [ ] **Step 5: Delete the SVG file**

Run: `git rm frontend/src/logo.svg`

- [ ] **Step 6: Verify no dangling references**

Run: `grep -rn "logo.svg" frontend/src`
Expected: no matches.

Run: `cd frontend && npx tsc --noEmit`
Expected: no TypeScript errors (the dropped import leaves no broken symbol references).

- [ ] **Step 7: Manual verify**

Run: `cd frontend && npm run dev`.
Expected: header shows "Ao5" in bolder type with the underline still present; the small CRA atom icon is gone. The Auth page shows "Ao5" as a clean text mark above the login box instead of the circular atom. Flip themes — the title underline and text color flip correctly.

- [ ] **Step 8: Commit**

```bash
git add -A frontend/src/components/Header.tsx frontend/src/components/Header.css \
          frontend/src/components/Auth.tsx frontend/src/components/Auth.css \
          frontend/src/logo.svg
git commit -m "feat: replace CRA logo with typographic Ao5 mark"
```

---

## Task 17: Branding sync in root README

**Files:**
- Modify: `README.md`

`package.json` already has `"name": "decipher"`, so no change there. The spec's final branding task is to update the root README title.

- [ ] **Step 1: Edit README title**

In `README.md`, change line 1 from:

```markdown
# Ao5 — Speedcubing Timer
```

to:

```markdown
# Decipher (Ao5)
```

Leave line 2–onward alone; the spec says to keep the in-app product name as "Ao5".

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: rename project to Decipher (in-app name stays Ao5)"
```

---

## Task 18: Phase 3 acceptance run-through

- [ ] **Step 1: Run the dev server**

Run: `cd frontend && npm run dev`

- [ ] **Step 2: Walk through each acceptance criterion**

Check each line against the running app:

- At 1400px viewport: puzzle selector shows full horizontal tabs.
- At 800px viewport: puzzle selector shows horizontally-scrolling chips with snap points.
- At 500px viewport: puzzle selector shows a native `<select>` dropdown.
- The active puzzle tab has a filled surface and a blue underline (not just an undefined `.active` class).
- Toggle theme button flips every color: background, panels, buttons, charts, solve log rows, auth page, dialogs.
- Hard refresh in a fresh incognito window where the OS is in light mode — app opens in light mode on first load.
- Search the DOM: no element that should've re-themed stays dark (or light) by accident.
- `grep -rn 'Reset Session' frontend/src` returns nothing.
- `grep -rn logo.svg frontend/src` returns nothing.
- Run `cd frontend && npx tsc --noEmit` — no errors.
- Run `cd frontend && npx vitest run` — all existing tests pass (including the new `useTheme` tests).
- Run `grep -rnE '#[0-9a-fA-F]{3,8}' frontend/src/components/ --include='*.css'` — no raw hex in component CSS except `var()` fallbacks in `Timer.css`.

- [ ] **Step 3: If anything fails, open a targeted follow-up commit per issue**

Do not silently paper over failures. Either fix + commit (`fix: <specific thing>`) or note the gap in `TASKS.txt` and continue.

- [ ] **Step 4: Final commit (if anything changed during acceptance)**

```bash
git status
# if clean: Phase 3 complete.
# if dirty: commit the residual fix-ups with clear messages before declaring done.
```

---

## Self-review (for the plan author)

**Spec coverage (every scope bullet from Phase 3 in revamp.md):**
- ✅ Theme tokens consolidated → Tasks 4, 5, 6, 7.
- ✅ `[data-theme="light"]` overrides → Task 8.
- ✅ Theme toggle in Header with localStorage + prefers-color-scheme → Tasks 1, 2, 3, 10.
- ✅ Active tab fix → Task 11.
- ✅ Three-tier responsive breakpoints → Task 12.
- ✅ Timer section overflow hack → Task 13.
- ✅ "Reset Session" → "Clear view" move & rewording → Task 14.
- ✅ `<h2>` → `<div>` scramble semantics → Task 15.
- ✅ Logo replacement → Task 16.
- ✅ Branding sync (README; `package.json` already done) → Task 17.
- ✅ Chart colors re-theme → Task 9 (implicit under theme tokens requirement).

**Placeholder scan:** No "TODO", "similar to above", or "add appropriate X" language. Each step has literal code or literal commands.

**Type consistency:** `useTheme`, `ThemeProvider`, `Theme`, `ChartColors`, `chartColors(theme)` used consistently across Tasks 1, 2, 3, 9, 10. `STORAGE_KEY = 'decipher.theme'` used consistently across tests and implementation.

**Known follow-up:** Phase 5 will fold the theme toggle into a full Settings modal (spec line 284). The Header button becomes a second entry point at that time; this plan doesn't remove it then.
