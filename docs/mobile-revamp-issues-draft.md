# Mobile revamp issues (draft for review)

Eleven issues to file with the `Sandcastle` label. The Sandcastle planner builds a dependency graph from the bodies; each issue notes its dependencies inline.

After you scan and approve, the orchestrator can file these via `gh issue create --label Sandcastle ...` one at a time.

---

## Issue 1 — Mobile foundation: iOS Safari hygiene + breakpoint convention

This is the foundation for the mobile revamp. Land this first. Every other mobile issue depends on the primitives this introduces.

### Problem

The site currently has:
- 7 uses of `100vh` that misbehave on iOS Safari (the URL bar shifts the visual viewport)
- No `viewport-fit=cover` in the meta tag, so backgrounds don't extend to the iPhone notch and home indicator
- Zero uses of `safe-area-inset-*`, so content slides under the Dynamic Island and home indicator on iPhone 15 Pro
- No documented mobile breakpoint convention. Existing media queries scatter across 480 / 639 / 768 / 1023 px

### Acceptance criteria

- [ ] `frontend/index.html` viewport meta updated to `width=device-width, initial-scale=1, viewport-fit=cover`
- [ ] All 7 occurrences of `100vh` replaced with `100dvh`. No fallback needed (Safari 15.4+ has `dvh`):
  - `frontend/src/App.css` (×2)
  - `frontend/src/index.css`
  - `frontend/src/components/SolveSession.css`
  - `frontend/src/components/Auth.css`
  - `frontend/src/pages/Stats.css`
  - `frontend/src/pages/SharedSolve.css`
- [ ] Top-level layout containers respect safe-area-inset on phone:
  - Header gets `padding-top: max(<existing-pad>, env(safe-area-inset-top))` so it clears the Dynamic Island
  - Page bottoms (where applicable) get `padding-bottom: max(<existing-pad>, env(safe-area-inset-bottom))` so content clears the home indicator
- [ ] `.sandcastle/CODING_STANDARDS.md` updated with a new "Mobile / responsive" section documenting:
  - Breakpoints: phone ≤ 600px, tablet 601-1023px, desktop ≥ 1024px
  - Use `100dvh` (not `100vh`) for full-height containers
  - Use `env(safe-area-inset-*)` patterns for top/bottom padding on full-bleed components
- [ ] `npm run typecheck` and `npm run test` pass

### Files to touch

- `frontend/index.html`
- `frontend/src/App.css`
- `frontend/src/index.css`
- `frontend/src/components/SolveSession.css`
- `frontend/src/components/Auth.css`
- `frontend/src/components/Header.css`
- `frontend/src/pages/Stats.css`
- `frontend/src/pages/SharedSolve.css`
- `.sandcastle/CODING_STANDARDS.md`

### Notes

- Pure plumbing. No visual redesign in this issue.
- Don't change layout structure; only swap units and add safe-area padding.
- Tablet and desktop are unaffected by these changes (`dvh` is universally supported).

---

## Issue 2 — Mobile Header: hamburger menu + SettingsPanel as modal at ≤ 600px

**Depends on:** Issue 1 (Mobile foundation). Land that first.

### Problem

On phone (≤ 600px) the Header overflows horizontally. "Trainers" gets cut off on the left and "Login" / "Logout" gets cut off on the right because the existing horizontal layout (logo + nav links + puzzle picker + gear button + sign-in button) doesn't fit. The page itself ends up with a horizontal scrollbar because the Header pushes total page width past the viewport.

### Goal

When you open the app on iPhone Safari, the header should feel calm and uncluttered — no truncated text on either edge, no awkward horizontal scrollbar at the bottom of the page. The only three things visible at the top are: the **Ao5** logo on the left, the puzzle picker dropdown in the middle, and a clear hamburger icon on the right. Tapping the hamburger should make a tidy menu drop down — Timer, Stats, Trainers, Settings, then a small visual gap, then Sign In or Logout. The menu should feel like a standard responsive-web menu (think Wikipedia mobile, GitHub mobile), not an iOS native sheet. Tapping outside, hitting Esc, or selecting an item should close it cleanly.

When the user taps "Settings" in the menu on phone, the SettingsPanel should appear as a centered modal with a dim backdrop — not a tiny dropdown floating in space (which is what would happen with the existing positioning).

### Solution

At ≤ 600px the Header collapses to **logo + puzzle picker + hamburger button**. Tap hamburger to open a menu panel below the header.

Menu contents in order:
1. Timer
2. Stats
3. Trainers
4. Settings (opens SettingsPanel)
5. *visual separator (4-6 px gap or thin `border-top`)*
6. Sign In *or* Logout (depending on auth state)

When SettingsPanel is opened from the hamburger on phone, it renders as a centered modal overlay (same backdrop pattern as SolveDetailModal) instead of an absolute-positioned dropdown anchored to the gear button (which is no longer in the header on phone).

At ≥ 601px the Header keeps its current horizontal layout exactly as is.

### Acceptance criteria

- [ ] At ≤ 600px the Header shows only logo, puzzle picker, hamburger button
- [ ] Hamburger has `aria-label="Menu"`, `aria-expanded`, `aria-haspopup="menu"`
- [ ] Menu items in the order above; Sign In/Logout group visually separated with 4-6 px gap or `border-top`
- [ ] Menu closes on: tap outside, Esc, tap on any item
- [ ] Reuse existing `useDismissOnOutsideClick` and `useFocusTrap` hooks. No new dependencies.
- [ ] On phone, SettingsPanel renders as a centered modal with backdrop and `aria-modal="true"` (same pattern as SolveDetailModal)
- [ ] At ≥ 601px the Header is unchanged
- [ ] Page no longer overflows horizontally on phone (the existing horizontal scrollbar bug is fixed by this change)

### Tests required (TDD — write these first)

- [ ] Test: at width 393px the hamburger button renders; logo, puzzle picker, hamburger are the only top-level header children
- [ ] Test: at width 1024px the existing horizontal Header renders; no hamburger
- [ ] Test: clicking hamburger calls the open handler and `aria-expanded` becomes `"true"`
- [ ] Test: menu contains the 5 expected items in order (Timer / Stats / Trainers / Settings / Sign In|Logout)
- [ ] Test: clicking outside the menu closes it (covered by `useDismissOnOutsideClick`)
- [ ] Test: pressing Esc closes the menu
- [ ] Test: tabbing inside the open menu cycles through menu items (focus trap)
- [ ] Test: when SettingsPanel is opened from the hamburger on phone, it has `role="dialog"` and `aria-modal="true"`
- [ ] All existing Header / AppNav tests still pass

### Final checks

- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes (new tests + existing)
- [ ] Visual verification: screenshot at 393×852, 768×1024, 1440×900 and confirm via Read tool that the goal description matches what's on screen

### Files to touch

- `frontend/src/components/Header.tsx` and `Header.css`
- `frontend/src/components/AppNav.tsx` and `AppNav.css`
- `frontend/src/components/SettingsPanel.tsx` and `SettingsPanel.css`

### Notes

- Update the existing `useMatchMedia('(max-width: 639px)')` call in `Header.tsx` to `(max-width: 600px)` to match the convention.
- Puzzle picker stays as-is. It already adapts correctly (`<select>` on mobile, button group on desktop).
- This is the riskiest issue in the queue. Touch logic, not just CSS.

---

## Issue 3 — Mobile Scramble polish

**Depends on:** Issue 1 (Mobile foundation).

### Problem

On phone, the scramble panel has too much horizontal padding eating into available width, the font feels small relative to the available space, and long scrambles for 5x5/6x6/7x7 wrap awkwardly.

### Goal

The scramble should feel like the *content* of the timer page on phone, not a cramped detail. Reading the moves should be effortless at arm's length. The text should use most of the available horizontal width, with just enough side padding to keep it from kissing the screen edges (think ~8 px each side, not the current ~24 px). Long scrambles (5x5+) should wrap into clean lines that all break at similar widths, not jagged. The font should be confident — large enough to read while holding the phone in one hand without bringing it close.

### Acceptance criteria

- [ ] Reduce horizontal padding on the scramble container at ≤ 600px (likely from current ~1.5rem to ~0.5-0.75rem) so scramble text uses more of the available width
- [ ] Bump the scramble font size on phone via `clamp()` so it scales gracefully with viewport width without hardcoding a per-puzzle font size. Aim for ~20-24px at 393px viewport.
- [ ] Allow `word-break: break-word` (or equivalent) so long scrambles wrap cleanly without overflow
- [ ] Tablet and desktop unaffected
- [ ] `npm run typecheck` and `npm run test` pass

### Files to touch

- `frontend/src/components/Scramble.css`

### Notes

- CSS-only. No component logic changes.
- Verify the scramble visual against the existing reference of how scrambles look on desktop (don't make them ugly there).

---

## Issue 4 — Mobile Stats page chrome

**Depends on:** Issue 1 (Mobile foundation).

### Problem

The Stats page wrapper, toolbar (DateRangeFilter), StatsSummary, and RecentTrend components have minimal mobile adaptation. Layout is functional but cramped or wastes space at phone width. None of these components has a media query.

### Acceptance criteria

- [ ] At ≤ 600px the `.stats-toolbar` wraps cleanly. DateRangeFilter preset buttons fit on one line if possible; custom date inputs wrap below them.
- [ ] At ≤ 600px the `.stats-card` outer padding tightens slightly (from `1rem 1.25rem` to ~`0.75rem 1rem`) for more usable card width
- [ ] StatsSummary already uses `auto-fit, minmax(140px, 1fr)`. Verify it shows 2 columns at 393px width (current) and looks intentional. If it's awkward, drop `minmax` to `(120px, 1fr)`.
- [ ] RecentTrend `gap: 1.5rem` reduced to `0.75rem` at ≤ 600px so rows don't waste space
- [ ] Tablet and desktop unaffected
- [ ] `npm run typecheck` and `npm run test` pass

### Files to touch

- `frontend/src/pages/Stats.css`
- `frontend/src/components/stats/StatsSummary.css`
- `frontend/src/components/stats/RecentTrend.css`
- `frontend/src/components/stats/DateRangeFilter.css`

### Notes

- CSS-only. Tweaks, not restructure.
- Don't touch DotPlot or ScrambleHistory — those have their own issues.

---

## Issue 5 — Mobile DotPlot horizontal scroll

**Depends on:** Issue 1 (Mobile foundation).

### Problem

DotPlot is an SVG chart with axis labels and ticks. At phone width (393px) the labels collide and the chart becomes unreadable. The chart logic does not adapt the rendering to viewport width.

### Goal

On phone the chart should remain *legible* — labels not collided, axis readable, dots distinguishable — at the cost of being viewable in one screen. The user should see the chart's left edge by default and have an obvious affordance that they can swipe horizontally to see the rest. A subtle gradient mask on the right edge (fading to the card's background color) is enough of a "more here" cue. Tablet and desktop are unaffected — the chart fits naturally there.

### Solution

Don't redesign the chart. Instead, wrap the chart in a horizontally-scrollable container at phone width. The card stays viewport-width; the SVG inside keeps its desktop rendering and the user swipes horizontally to see the full plot.

### Acceptance criteria

- [ ] At ≤ 600px the DotPlot card has `overflow-x: auto` on its inner content wrapper
- [ ] At ≤ 600px the inner SVG has a `min-width` large enough that it doesn't get squashed (e.g., `min-width: 720px`). The exact value should be tuned so labels remain readable.
- [ ] `-webkit-overflow-scrolling: touch` for smooth iOS scrolling
- [ ] A subtle visual cue (e.g., gradient mask on right edge) hints that horizontal scrolling is available. Optional but recommended.
- [ ] Tablet and desktop: untouched. Chart fits naturally there.
- [ ] `npm run typecheck` and `npm run test` pass

### Files to touch

- `frontend/src/components/stats/DotPlot.css`
- `frontend/src/pages/Stats.css` (only if the wrapping needs to happen at the card level)
- Possibly `frontend/src/components/stats/DotPlot.tsx` if the JSX needs an inner scroll wrapper

### Notes

- Don't try to dynamically reduce tick density or relabel the SVG. Horizontal scroll is the intentional approach.

---

## Issue 6 — Mobile ScrambleHistory stacked rows

**Depends on:** Issue 1 (Mobile foundation).

### Problem

ScrambleHistory rows are a 4-column grid: `auto auto 1fr auto` (date, time, scramble text, replay button). At phone width the `1fr` scramble text column collapses to ellipsis-only and is useless.

### Goal

On phone, each row of past scrambles should feel like a small card — the user can read the date, the time, AND the actual scramble moves without truncation. The row stacks vertically: line 1 has the date and time inline (small, muted), line 2 is the scramble in the existing monospace style with proper wrapping, line 3 has the "Replay" button right-aligned with a real tap target. The row gains a bit of vertical breathing room so the lines don't crowd. Tablet and desktop keep the dense single-line 4-column layout — that's still the right call when you have horizontal real estate.

### Solution

At ≤ 600px the row stacks vertically:
- Row 1: date + time inline (`auto auto`)
- Row 2: scramble text full width with `white-space: normal; word-break: break-word`
- Row 3: replay button right-aligned

Tablet and desktop keep the existing 4-column layout.

### Acceptance criteria

- [ ] At ≤ 600px each `.scramble-history-row` lays out as three vertical rows (date+time / scramble / replay button)
- [ ] Scramble text becomes fully readable — no ellipsis truncation at phone width
- [ ] Replay button is right-aligned at the bottom of the row, with adequate tap target (≥ 44 pt min-height)
- [ ] Row spacing tightens slightly to compensate for taller rows
- [ ] Tablet and desktop: 4-column layout unchanged
- [ ] `npm run typecheck` and `npm run test` pass

### Files to touch

- `frontend/src/components/stats/ScrambleHistory.css`

### Notes

- CSS-only. Use `grid-template-areas` or media-query-swapped `grid-template-columns` — your choice.

---

## Issue 7 — Mobile SolveLog with swipe-to-delete

**Depends on:** Issue 1 (Mobile foundation).

### Problem

SolveLog has zero media queries. Each row's DNF / +2 / delete buttons have ~24px tap targets (Apple HIG minimum is 44pt). On phone they're miserable to hit accurately. The internal `stats-container` is a 4-column grid that's cramped at 393px width.

### Goal

On phone, the solve list feels like a native iOS list. Each row shows the time prominently with DNF and +2 toggles inline, sized like real buttons (44+ pt). When the user swipes left on a row, it slides under their finger to reveal a red delete affordance — Apple Mail style. Snap-back if they release before threshold; snap-open if past. Tap on the row body still opens the SolveDetailModal as before. The summary stats grid above (AO5 / AO12 / MEAN / BEST) goes from 4 squashed columns to 2 readable ones at phone width. Tablet and desktop are unchanged — the existing dense layout works there.

### Solution

At ≤ 600px:
1. **Swipe-left to delete** on each solve row. Standard iOS pattern (Apple Mail, Reminders). Reveals a red delete affordance; tap to confirm.
2. **Remove the inline delete button** on phone. Delete is covered by swipe + the SolveDetailModal action.
3. **Keep DNF and +2 as inline toggles** but bump padding so the tap target is ≥ 44 pt at phone width. They communicate the solve's state visually, so they stay visible (don't hide them in a kebab menu).
4. **Internal stats grid drops from 4 columns to 2 columns** at ≤ 600px so AO5/AO12/MEAN/BEST get readable widths.

Tablet and desktop layouts are unchanged.

### Acceptance criteria

- [ ] At ≤ 600px the inline delete button is hidden
- [ ] At ≤ 600px swipe-left on a solve row reveals a red delete affordance. Tap once to confirm and delete.
- [ ] Swipe-to-delete is implemented with a small custom hook (e.g., `frontend/src/hooks/useSwipeToReveal.ts`). **No new dependencies** (do not add `react-swipeable` or similar). Use bare `onTouchStart` / `onTouchMove` / `onTouchEnd` events.
- [ ] DNF and +2 buttons have `min-height: 44px` and adequate horizontal padding at ≤ 600px to feel tap-friendly
- [ ] At ≤ 600px the `.stats-container` grid is `grid-template-columns: repeat(2, 1fr)` (was 4)
- [ ] Tap on the row body still opens SolveDetailModal (existing behavior)
- [ ] Tablet and desktop layouts unchanged

### Tests required (TDD — write these first)

- [ ] Test for `useSwipeToReveal` hook: simulate touchstart/touchmove/touchend events with a delta past threshold, assert the hook returns `revealed: true`
- [ ] Test for `useSwipeToReveal` hook: simulate a swipe with delta below threshold, assert it returns `revealed: false` after touchend (snap-back)
- [ ] Test for `useSwipeToReveal` hook: vertical swipe greater than horizontal does not trigger (lets the page scroll naturally)
- [ ] Component test: at width 393px (mock matchMedia), the inline delete button is not in the DOM
- [ ] Component test: at width 1024px, the inline delete button is in the DOM
- [ ] Component test: tapping the row body fires the onClick handler that opens SolveDetailModal (existing behavior preserved)
- [ ] All existing SolveLog tests still pass

### Final checks

- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes (new tests + existing)
- [ ] Visual verification: screenshot at 393×852 and confirm via Read tool that swipe affordance is correct, tap targets feel large, stats grid is 2 columns

### Files to touch

- `frontend/src/components/SolveLog.tsx`
- `frontend/src/components/SolveLog.css`
- Possibly a new `frontend/src/hooks/useSwipeToReveal.ts` (in-house, no deps)

### Notes

- The swipe gesture should feel natural: row drags with finger, snaps back if released before threshold, snaps to "delete revealed" state if past threshold. Threshold around 60-80 px.
- Keyboard / pointer users still need a path to delete. Tapping the row opens the detail modal which has a delete button. Verify that flow remains intact.

---

## Issue 8 — Mobile Timer size and tap target

**Depends on:** Issue 1 (Mobile foundation).

### Problem

The timer card is small at phone width — it takes ~12% of viewport height. The tap-and-hold target is hard to hit accurately, and the timer doesn't feel like the focal point of the page.

### Goal

The timer should be the unmistakable focal point of the page on phone. When you glance at it, the digits are bold and large enough to read at full arm's length. The card has generous vertical real estate — easily 30% of the viewport — so when you tap-and-hold to start the timer, you don't have to aim, you just slap your thumb onto the visible card area. The card itself feels confident, not cramped. Padding around the digits is comfortable. On desktop and tablet the timer keeps its existing proportions; this is a phone-only intervention.

### Acceptance criteria

- [ ] At ≤ 600px the timer card has `min-height: 30dvh` so the tap-and-hold target is generous
- [ ] At ≤ 600px the digit font size scales up via `clamp(72px, 20vw, 160px)` (currently ~47px on a 393px screen)
- [ ] Card padding at ≤ 600px bumped to ~1rem (currently 0.5rem)
- [ ] At 601-1023px (tablet) `min-height: 25dvh`, smaller digit clamp (e.g., `clamp(80px, 14vw, 144px)`)
- [ ] Desktop (≥ 1024px) unchanged
- [ ] `onTouchStart` / `onTouchEnd` behavior on the timer div is preserved (verify by reading the code, no changes expected)
- [ ] `npm run typecheck` and `npm run test` pass

### Files to touch

- `frontend/src/components/Timer.css`

### Notes

- CSS-only. Don't touch `Timer.tsx` unless something is genuinely broken with the existing tap-and-hold logic at the new size.
- The `#timer` element's `display: flex` and centered layout means the entire card area is already the tap target. Just make the card bigger.

---

## Issue 9 — Mobile Trainers polish

**Depends on:** Issue 1 (Mobile foundation).

### Problem

Trainers page is mostly functional on mobile (the layouts already use `flex-wrap: wrap` and `max-width` constraints). Minor adjustments needed for sub-nav fit and gap density.

### Acceptance criteria

- [ ] At ≤ 600px the trainer sub-nav (PLL / OLL / F2L / CMLL) fits without overflow. Bump padding/font down slightly if needed; allow horizontal scroll if absolutely necessary.
- [ ] At ≤ 600px the `.trainer-case-picker` gap reduces from `1rem` to `0.5rem` for tighter spacing
- [ ] At ≤ 600px `.trainer-recent-strip` gap reduces similarly
- [ ] PllTrainer (`max-width: 720px; margin: 0 auto`) padding tightens slightly on phone (from `1rem` to ~`0.75rem`)
- [ ] Tablet and desktop unaffected
- [ ] `npm run typecheck` and `npm run test` pass

### Files to touch

- `frontend/src/pages/Trainers.css`
- `frontend/src/components/trainers/TrainerCasePicker.css`
- `frontend/src/components/trainers/TrainerRecentStrip.css`
- `frontend/src/components/trainers/PllTrainer.css`

### Notes

- Pure tweaks. Smallest issue in the queue.

---

## Issue 10 — Mobile SolveDetailModal and HotkeyHelp polish

**Depends on:** Issue 1 (Mobile foundation).

### Problem

- `SolveDetailModal` has a `.solve-detail-actions` row with multiple buttons (DNF, +2, copy scramble, copy share link, delete). At phone width, the row overflows or pushes delete off-screen.
- `HotkeyHelp` is mostly OK at phone width (uses `min-width: min(24rem, 90vw)`) but the padding feels generous.

### Acceptance criteria

- [ ] At ≤ 600px `.solve-detail-actions` is `flex-wrap: wrap` with `gap: 0.5rem` so buttons wrap to a second line cleanly when they don't fit
- [ ] All buttons in the action row have `min-height: 44px` at ≤ 600px (touch-friendly)
- [ ] At ≤ 600px `.solve-detail-modal` padding tightens from `1.5rem 1.75rem` to `1.25rem` for more usable content area
- [ ] At ≤ 600px `.hotkey-help-modal` padding tightens from `1.5rem` to `1.25rem`
- [ ] At ≤ 600px `.solve-detail-time` font size reduces slightly if it overflows (from `2.5rem` to ~`2rem`)
- [ ] Tablet and desktop unaffected
- [ ] `npm run typecheck` and `npm run test` pass

### Files to touch

- `frontend/src/components/SolveDetailModal.css`
- `frontend/src/components/HotkeyHelp.css`

### Notes

- CSS-only.

---

## Issue 11 — Mobile Auth and SharedSolve polish

**Depends on:** Issue 1 (Mobile foundation).

### Problem

- `Auth`: `.auth-button` has `padding: 0.75rem` giving ~38px tap target (under iOS 44pt). `.auth-logo-text` at `3rem` (48px) feels oversized at 393px viewport.
- `SharedSolve`: `padding: 3rem 1rem` at the page top is excessive vertical space on phone.

### Acceptance criteria

- [ ] At ≤ 600px `.auth-button` padding bumps to ~`0.9rem` (or `min-height: 44px`) so it hits 44pt tap target
- [ ] At ≤ 600px `.auth-logo-text` font size reduces from `3rem` to `2.25rem`
- [ ] At ≤ 600px `.shared-solve-page` padding reduces from `3rem 1rem` to `1.5rem 1rem`
- [ ] At ≤ 600px `.shared-solve-card` padding reduces from `2rem` to `1.25rem` (more usable content area)
- [ ] At ≤ 600px `.shared-solve-time` font size reduces from `3rem` to `2.5rem` if visually warranted
- [ ] Tablet and desktop unaffected
- [ ] `npm run typecheck` and `npm run test` pass

### Files to touch

- `frontend/src/components/Auth.css`
- `frontend/src/pages/SharedSolve.css`

### Notes

- CSS-only.
