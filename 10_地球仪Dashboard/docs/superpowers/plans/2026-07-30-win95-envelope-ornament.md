# Win95 Envelope Ornament Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or superpowers:subagent-driven-development) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the existing mailbox behavior as a transparent, draggable Win95 pixel envelope.

**Architecture:** `archive-envelope.svg` owns the visible pixel illustration. The existing ornament button remains the accessible pointer and keyboard surface; existing `workspace.js` code continues to own drag events, role routing, and notification state.

**Tech Stack:** Static SVG, HTML, CSS, vanilla browser events, Node test runner, Vite.

## Global Constraints

- Only local assets; no runtime icon request.
- Preserve `data-workspace-mailbox-ornament`, `data-workspace-mailbox-alert`, and `mailbox` command dispatch.
- No gray outer panel, gradient, rounded card, or animation.
- Above workspace windows and start menu; hidden whenever the workspace is hidden.

---

### Task 1: Pixel envelope artwork and transparent shell

**Files:**
- Modify: `public/assets/icons/archive-envelope.svg`
- Modify: `src/style.css:9393-9461`
- Test: `tests/clerk-workspace.test.mjs`

**Interfaces:**
- Consumes: `<img src="/assets/icons/archive-envelope.svg">` in `[data-workspace-mailbox-ornament]`.
- Produces: a transparent hit target with a 32 by 32 pixel envelope visual.

- [ ] **Step 1: Write failing assertions**

```js
assert.match(envelopeAsset, /viewBox="0 0 32 32"/);
assert.match(styles, /background: transparent/);
assert.doesNotMatch(ornamentRule, /border: 2px outset/);
```

- [ ] **Step 2: Verify failure**

Run: `node --test tests/clerk-workspace.test.mjs`

Expected: the test fails because the old envelope is 24 by 24 and the shell uses a gray raised border.

- [ ] **Step 3: Implement the visual change**

```svg
<svg viewBox="0 0 32 32" shape-rendering="crispEdges">
  <!-- hard shadow, cream envelope, blue stamp, navy folds -->
</svg>
```

```css
#clerk-desktop [data-workspace-mailbox-ornament] {
  border: 0;
  background: transparent;
  box-shadow: none;
}
```

- [ ] **Step 4: Verify passing test**

Run: `node --test tests/clerk-workspace.test.mjs`

Expected: zero failures.

### Task 2: Preserve the interaction contract and build

**Files:**
- Verify: `src/archive-workflow/workspace.js`
- Test: `tests/clerk-workflow-ui.test.mjs`

**Interfaces:**
- Consumes: `initializeMailboxOrnament`, `palis:workspace-command`, `refreshMailboxAlert`.
- Produces: unchanged click, drag, role routing, and alert behavior.

- [ ] **Step 1: Verify interaction contract**

Run: `node --test tests/clerk-workflow-ui.test.mjs`

Expected: zero failures and coverage for pointer capture plus real mailbox alert data.

- [ ] **Step 2: Verify production output**

Run: `git diff --check; npm.cmd run build`

Expected: both exit 0; the pre-existing Vite chunk-size warning is acceptable.
