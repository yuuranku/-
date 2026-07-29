# PALIS Win95 workspace shell — Tasks 1–4 report

## Implemented

- Replaced the direct nine-template desktop launcher with a Start-menu Win95 shell, tray status, exit and sync dialogs, and seven role-aware shortcuts.
- Added local cabinet, management, and assistant icons plus the `archive-cabinet` module. The cabinet retains all nine registry categories and makes station/entrance amendment-only for clerks.
- Added command dispatch, cabinet window creation, classic minimize/maximize state, task buttons, window-focus coordination, narrow viewport state, and workspace close-all lifecycle events.
- Added dirty-draft coordination: local flush/discard choices, volatile-file refusal, monotonic autosave generations, sync state reporting, role/scope transition protection, and guarded sign-out entry.
- Updated the local-admin verification script to enter folders via the cabinet and leave via Start menu.

## RED / GREEN evidence

- RED tests were added first for the cabinet contract and autosave generation contract. The initial intended command was interrupted before it could return its expected missing-module failure.
- GREEN: the focused Node suite below passes after implementation (47 tests, 0 failures).

## Commands and results

```powershell
node --check src/main.js; node --check src/auth.js; node --check src/archive-workflow/workspace.js; node --check src/archive-workflow/autosave.js
```

Passed.

```powershell
node --test tests/archive-autosave.test.mjs tests/archive-cabinet.test.mjs tests/clerk-workspace.test.mjs tests/clerk-workflow-ui.test.mjs tests/archive-workflow-client.test.mjs tests/workspace-ux-regression.test.mjs
```

Passed: 47 tests, 0 failures.

`tests/local-admin-runtime-browser.test.mjs` was updated but intentionally not run here; the parent agent will validate it in the approved browser environment.

## Changed files

`index.html`, `src/main.js`, `src/auth.js`, `src/style.css`, `src/archive-workflow/workspace.js`, `src/archive-workflow/workspace.css`, `src/archive-workflow/autosave.js`, `src/archive-workflow/archive-cabinet.js`, `scripts/verify-local-admin.mjs`, the focused tests, and three local SVG icons.

## Self-review and risks

- Public archive rendering, database migrations, numbering, Supabase request paths, and existing art assets were not changed.
- The implemented shell CSS is functional rather than a final visual-polish pass; Task 5 may refine visual details.
- Browser interaction coverage is pending the parent-run local-admin test. The suite’s updated flow covers Start/Escape and cabinet-to-editor navigation.

## Fix round 1

- Added a desktop-level pointerdown boundary: an open Start menu now closes on desktop background clicks, while clicks inside Start, the Start button, and any workspace window leave it open.
- Connected `palis:workspace-sync-state` to a live tray model and sync dialog; the tray now reflects LOCAL/SYNCING/OFFLINE/ONLINE and opens a modal summary.
- Added `is-narrow-forced` synchronization to workspace assistant documents, matching workflow windows; it clears again on desktop resize.
- At narrow widths, visible workflow and workspace-assistant minimize/close controls now have a 44px minimum hit target. Maximize remains intentionally hidden at narrow widths.
- Replaced the batch-added static clerk-shell assertions with browser behavior coverage. The local-admin browser test now exercises Start boundary clicks, sync dialog state, both narrow-window classes, and computed hit targets. Browser validation remains assigned to the parent agent.

Fix-round pure verification:

```powershell
node --check src/main.js; node --check src/archive-workflow/workspace.js
node --test tests/archive-autosave.test.mjs tests/archive-cabinet.test.mjs tests/clerk-workspace.test.mjs tests/clerk-workflow-ui.test.mjs tests/archive-workflow-client.test.mjs tests/workspace-ux-regression.test.mjs
```

Passed: 45 tests, 0 failures.

### Browser-fixture correction

The first browser run found a fixture sequencing error: the test closed the welcome window and then tried to click its hidden titlebar. The Start-menu boundary assertion now opens the visible archive cabinet first, clicks its real titlebar to prove workspace-window clicks preserve Start, then clicks the visible desktop watermark to prove a desktop-surface click closes Start. No behavior assertion was removed.

The second browser run exposed that the window-layer container was treated as a blanket exclusion. The desktop handler now excludes only actual windows and controls, not their full-screen layer; decorative watermark hits therefore close Start. The browser assertion also verifies `aria-expanded="false"` after that close.

The third browser run showed the watermark's click geometry was still covered by the visible cabinet window. The fixture now minimizes that real cabinet through its window control while Start remains open, asserts its task button persists, clicks the now-uncovered watermark to close Start, and restores the cabinet through that task button before continuing. This preserves the Start boundary assertion and adds real minimize/restore coverage.
