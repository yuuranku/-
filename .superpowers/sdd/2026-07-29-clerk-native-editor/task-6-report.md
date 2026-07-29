# Task 6 report — docked native editor and shared window motion

## Outcome

- Added `dock: 'right'` to the workbench window contract and made the native
  editor use it instead of carrying a presentation-only class in `className`.
- Right-docked editors skip centered inline bounds, titlebar dragging,
  maximize/restore bounds, and fill the bounded workspace window layer at the
  right edge with `width: clamp(560px, 34vw, 680px)`.
- Narrow screens replace the dock width with a full-layer layout. The editor
  retains one scrolling body between its toolbar and footer.
- Final clerk desktop shortcuts use 96×96px minimum click targets and 60×60px
  icon glyphs. The two clerk actions occupy the compact first desktop column;
  narrow layouts use two responsive columns with the same target/glyph sizes.
- Normal workbench windows now use the existing desktop
  `window-unfold`, `window-minimize`, `window-restore`, and
  `window-task-close` keyframes with the existing 480/260/300/240ms timing,
  taskbar vectors, and reduced-motion immediate path.
- No new window keyframe and no sticky-note behavior was added.

## TDD record

### RED

`node --test tests/clerk-workspace.test.mjs tests/workspace-narrow-controls.test.mjs tests/workspace-ux-regression.test.mjs`

- 19 tests: 13 passed, 6 failed before implementation.
- Failures identified the old 72px targets/32px glyphs, absent dock argument
  and dock CSS, absent narrow dock override, the old `overflow-y` declaration,
  and the missing shared window-motion lifecycle.
- The drag/maximize assertion was tightened and rerun to prove the existing
  docked editor still accepted those interactions.

`node --test tests/local-admin-runtime-browser.test.mjs`

- Failed before implementation with the measured desktop icon width of 32px
  instead of 60px.

### GREEN

Focused Task 6 tests:

`node --test tests/clerk-workspace.test.mjs tests/workspace-narrow-controls.test.mjs tests/workspace-ux-regression.test.mjs`

- 19 passed, 0 failed.

Focused Task 5 workflow plus Task 6 regression tests:

`node --test tests/clerk-workspace.test.mjs tests/workspace-narrow-controls.test.mjs tests/workspace-ux-regression.test.mjs tests/clerk-workflow-ui.test.mjs tests/archive-autosave.test.mjs tests/archive-target-documents.test.mjs tests/archive-workspace-media.test.mjs tests/native-form-profiles.test.mjs tests/archive-category-profiles.test.mjs`

- 65 passed, 0 failed.

Real browser:

`node --test tests/local-admin-runtime-browser.test.mjs`

- 1 passed, 0 failed.
- Verified 60px glyphs at desktop and narrow viewports, the editor's 560px
  desktop dock and full narrow geometry, one scrolling body, rejected
  maximize/drag attempts, 44px narrow window controls, and opening,
  minimizing, and restoring lifecycle classes.

Production build:

`npm.cmd run build`

- Passed.
- Vite reported only the existing large-chunk warning.

## Browser debugging note

The first post-implementation browser run tried to click and measure windows
while `is-opening`/`is-restoring` transforms were still active. Puppeteer
therefore saw an unclickable opening control and later measured a transformed
15.8×1.96px intermediate frame instead of the final 44px control.

The product timing and 44px requirement were unchanged. The browser test now
asserts the lifecycle class first, waits for that existing lifecycle to finish,
and only then reads final geometry.

## Files changed

- `src/archive-workflow/workspace.js`
- `src/archive-workflow/workspace.css`
- `src/style.css`
- `tests/clerk-workspace.test.mjs`
- `tests/workspace-narrow-controls.test.mjs`
- `tests/workspace-ux-regression.test.mjs`
- `tests/local-admin-runtime-browser.test.mjs`
