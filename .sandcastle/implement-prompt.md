# TASK

Fix issue {{TASK_ID}}: {{ISSUE_TITLE}}

Pull in the issue using `gh issue view <ID>`. If it has a parent PRD, pull that in too.

Only work on the issue specified.

Work on branch {{BRANCH}}. Make commits and run tests.

# CONTEXT

Here are the last 10 commits:

<recent-commits>

!`git log -n 10 --format="%H%n%ad%n%B---" --date=short`

</recent-commits>

# EXPLORATION

Explore the repo and fill your context window with relevant information that will allow you to complete the task.

Pay extra attention to test files that touch the relevant parts of the code.

# EXECUTION

## For logic and component-state changes (TypeScript / TSX)

Use TDD. This is mandatory for any issue that introduces new behavior in `.ts` or `.tsx` files (custom hooks, state machines, conditional rendering, event handlers, etc.):

1. **RED**: write one failing test that captures the new behavior. Use `renderWithProviders` for components and `data-testid` over brittle CSS selectors. Mock `window.matchMedia` when the change depends on viewport.
2. **GREEN**: write the minimum code to pass it.
3. **REPEAT** for each behavior the issue requires (open menu, close on outside click, close on Esc, focus trap, etc.).
4. **REFACTOR** once green.

If the issue is purely CSS, skip TDD — jsdom does no layout, so testing a `@media` rule's effect is not possible. Rely on visual verification below instead.

## For all changes: visual verification with headless Chromium

After each round of changes, take screenshots at three viewports and read them with the Read tool to verify the change looks right.

The Vite dev server is already running at `http://localhost:5173` (started by the sandbox `onSandboxReady` hook). Vite has HMR, so your changes are reflected immediately — no need to restart.

```bash
chromium --headless --no-sandbox --hide-scrollbars \
  --window-size=393,852 --screenshot=/tmp/phone.png \
  http://localhost:5173

chromium --headless --no-sandbox --hide-scrollbars \
  --window-size=768,1024 --screenshot=/tmp/tablet.png \
  http://localhost:5173

chromium --headless --no-sandbox --hide-scrollbars \
  --window-size=1440,900 --screenshot=/tmp/desktop.png \
  http://localhost:5173
```

(Replace the URL path with the page being changed: `/stats`, `/trainers/pll`, `/login`, etc.)

Use the **Read** tool on each PNG. Verify:

- **Phone (393×852)** — the change looks intentional, not awkward; no overflow; tap targets feel large; the visual goal stated in the issue is met.
- **Tablet (768×1024)** — the change degrades gracefully or is unaffected.
- **Desktop (1440×900)** — the existing design is unchanged unless the issue explicitly requires it.

If a screenshot shows a problem, iterate. **Do not commit visually-broken work** — that's the whole point of having Chromium in the sandbox.

# FEEDBACK LOOPS

Before committing, all three must pass:

1. `npm run typecheck` (no TS errors)
2. `npm run test` (existing tests + any new ones you wrote pass)
3. Visual verification at all three viewports (above)

# COMMIT

Make a git commit. Follow the project convention defined in `@.sandcastle/CODING_STANDARDS.md`:

- Format: `type(scope): subject` (lowercase, ≤ 72 chars on the subject line).
- Examples: `style(solve-log): mobile breakpoint at 768px`, `fix(stats): chart overflow on phone widths`.
- Body (optional) explains the why and any non-obvious decisions, wrapped at 72 chars.
- Include the issue reference at the end of the body, e.g. `Closes #42` (do NOT close the issue from the commit; the orchestrator handles closure).
- No `Co-Authored-By` lines. No mention of AI tooling.

Keep it concise.

# THE ISSUE

If the task is not complete, leave a comment on the issue with what was done.

Do not close the issue - this will be done later.

Once complete, output <promise>COMPLETE</promise>.

# FINAL RULES

ONLY WORK ON A SINGLE TASK.
