# Inline Archive References Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the legacy-material and standalone reference panels from all native archive editors, leaving `/` as the only authoring path for archive references.

**Architecture:** `workspace.js` composes every native editor, so it is the single rendering and binding boundary for the retired panels. It will preserve `editorDocument.references` and legacy values inside draft collection, but will no longer render their manual UI or attach its search handlers. `editor-bridge.js` continues to own slash-token insertion and the public renderer continues to turn those tokens into clickable formal references.

**Tech Stack:** Vanilla ES modules, Vite, Node test runner, existing archive workspace DOM fixtures.

## Global Constraints

- Modify the production project directly at `C:\Users\yuuranko\Documents\白渊\10_地球仪Dashboard`.
- Do not discard stored legacy values or structured `references` while hiding their former editor panels.
- Do not change the formal-document reference-opening data attribute: `data-open-archive-reference`.

---

### Task 1: Retire the standalone editor panels while keeping inline references

**Files:**

- Modify: `src/archive-workflow/workspace.js:462-500, 986-998, 1034-1035, 1617-1621, 1659-1702`
- Modify: `src/archive-workflow/workspace.css:398-434`
- Test: `tests/clerk-workflow-ui.test.mjs`

**Interfaces:**

- Consumes: `createEditorBridge(...).insertReference(reference)` and the existing `references` draft array.
- Produces: native editor markup with no `[data-native-legacy]`, `[data-reference-search]`, `[data-reference-results]`, or `[data-reference-list]` surfaces.

- [x] **Step 1: Write the failing test**

```js
assert.doesNotMatch(workspace, /data-editor-section="references"/);
assert.doesNotMatch(workspace, /data-reference-search/);
assert.doesNotMatch(workspace, /data-native-legacy/);
assert.match(workspace, /insertReference\(reference\)/);
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern="inline references" tests/clerk-workflow-ui.test.mjs`

Expected: FAIL because the current workspace still renders the legacy and manual-reference panels.

- [x] **Step 3: Write minimal implementation**

```js
// Keep unknown legacy values in `priorValues`, but do not render a legacy section.
// Remove the data-editor-section="references" markup.
// Remove referenceSearch/referenceResults/referenceList queries and their listeners.
// Do not remove the `references` array from collectDraft() or editor bridge selection handling.
```

- [x] **Step 4: Run focused tests**

Run: `node --test tests/clerk-workflow-ui.test.mjs tests/native-form-profiles.test.mjs tests/archive-editor-bridge.test.mjs`

Expected: PASS, including persistence of legacy values and references.

### Task 2: Verify click-through survives formal rendering

**Files:**

- Test: `tests/archive-public-renderer.test.mjs`
- Verify: `src/archive-workflow/public-renderer.js:28-73, 228-251, 289-297, 451-497`

**Interfaces:**

- Consumes: stored `references` entries and tokens in the form `〔CODE LABEL〕`.
- Produces: buttons carrying `data-open-archive-reference="CODE"`, consumed by the delegated opener in `src/main.js`.

- [x] **Step 1: Run the focused formal-reference regression test**

Run: `node --test --test-name-pattern="citation tokens" tests/archive-public-renderer.test.mjs`

Expected: PASS and assert the citation token is a button, not plain text.

- [x] **Step 2: Run full focused regression set**

Run: `node --test tests/archive-public-renderer.test.mjs tests/archive-publication.test.mjs tests/archive-editor-bridge.test.mjs tests/native-form-profiles.test.mjs tests/clerk-workflow-ui.test.mjs`

Expected: 0 failures.

- [x] **Step 3: Build and inspect whitespace errors**

Run: `npm.cmd run build; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; git diff --check`

Expected: build exit code 0 and no diff-check errors.
