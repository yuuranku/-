# Remaining Archive Original-Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make country, station, entrance, ecology, and person records editable from their existing archive-system fields and publish them in their original document layouts.

**Architecture:** Extend the established native form profile/document flow rather than introducing a second editor model. The public renderer selects each category's original masthead, field structure, custom prose, media placement, stamp, and footer. Existing-record source conversion seeds the same native keys so amendments refill controls.

**Tech Stack:** Vanilla JavaScript modules, Node built-in test runner, Vite, existing archive workflow and CSS.

## Global Constraints

- Reuse each category's original archive UI; do not introduce a generic layout.
- Fixed fields must be the fields already exposed by the current archive system.
- Fixed fields are optional; repeatable custom sections and existing media behavior remain available.
- Editing an existing record must repopulate fixed fields, custom sections, and media.
- The public amendment action must load the selected record rather than create an empty editor.
- Existing archive references must round-trip through amendments and remain openable in the public record.
- Do not rename existing storage keys or archive categories.

---

### Task 1: Complete native form profiles for the five categories

**Files:**
- Modify: `src/archive-workflow/native-form-profiles.js`
- Modify: `tests/native-form-profiles.test.mjs`

**Interfaces:**
- Consumes: `getArchiveCategoryProfile(category)` index fields and existing `readNativeFormState`/`writeNativeFormDocument` functions.
- Produces: category profiles whose fields round-trip through the existing native editor controls.

- [ ] **Step 1: Write failing tests**

Add table-driven fixtures for `country`, `station`, `entrance`, `ecology`, and `person` that populate current index/body controls, one custom entry, and media. Assert `readNativeFormState` returns each current field and `writeNativeFormDocument` preserves all values.

- [ ] **Step 2: Run the focused test file to verify it fails**

Run: `node --test tests/native-form-profiles.test.mjs`

Expected: FAIL because the five profiles currently omit one or more established fields from the native body state.

- [ ] **Step 3: Implement the smallest profile extensions**

Declare the established archive-system fields in `NATIVE_FORM_PROFILES` with their existing storage keys and optional status. Keep existing index fields sourced from `category-profiles.js`, and only add body fields required by the original record panels.

- [ ] **Step 4: Run the focused test file to verify it passes**

Run: `node --test tests/native-form-profiles.test.mjs`

Expected: PASS.

### Task 2: Seed existing archive records into the same five native profiles

**Files:**
- Modify: `src/archive-workflow/official-archive-source.js`
- Modify: `tests/archive-workflow-editor-source.test.mjs` or `tests/local-workflow-engine.test.mjs`

**Interfaces:**
- Consumes: `toEditorDocumentFromArchiveBase(archive, staticRoot, template)`.
- Produces: documents whose `values`, `indexData`, custom sections, and media can be rendered by the Task 1 profiles without blank fields.

- [ ] **Step 1: Write failing source-seeding tests**

For each of the five categories, create an archive-system fixture containing established metadata and current document fields. Assert that `toEditorDocumentFromArchiveBase` returns those values under the matching native profile keys.

- [ ] **Step 2: Run the focused source test to verify it fails**

Run: `node --test tests/local-workflow-engine.test.mjs`

Expected: FAIL because legacy archive-system records currently retain only a generic legacy payload for these categories.

- [ ] **Step 3: Implement category-specific archive-base seed helpers**

Map known source fields to each category's existing native storage keys, preserve unmatched information as the existing legacy record, and retain custom text/media unchanged.

- [ ] **Step 4: Run the focused source test to verify it passes**

Run: `node --test tests/local-workflow-engine.test.mjs`

Expected: PASS.

### Task 3: Render original archive layouts for the five categories

**Files:**
- Modify: `src/archive-workflow/public-renderer.js`
- Modify: `src/style.css`
- Modify: `tests/archive-public-renderer.test.mjs`

**Interfaces:**
- Consumes: normalized native document values, custom sections, and media.
- Produces: formal archive markup using `registry-mast`, `station-log-mast`, `descent-mast`, `strata-mast`, and `personnel-mast` structures.

- [ ] **Step 1: Write failing renderer tests**

Add one test per category asserting its original structure class is present, the generic masthead is absent, current fixed fields render in the original field panel, the stamp remains present, and a custom entry follows the fixed panel.

- [ ] **Step 2: Run the focused renderer test to verify it fails**

Run: `node --test tests/archive-public-renderer.test.mjs`

Expected: FAIL because these categories currently use the generic formal document masthead.

- [ ] **Step 3: Implement category renderers and scoped layout bridges**

Add focused renderer helpers matching each original static document structure. Use current native field labels/keys; place the existing stamp in unused header space; use the original personnel portrait frame for person media. Add only category-scoped CSS needed to preserve the original layout at formal document widths and narrow screens.

- [ ] **Step 4: Run the focused renderer test to verify it passes**

Run: `node --test tests/archive-public-renderer.test.mjs`

Expected: PASS.

### Task 4: End-to-end regression verification

**Files:**
- Verify: `tests/native-form-profiles.test.mjs`
- Verify: `tests/archive-public-renderer.test.mjs`
- Verify: `tests/local-workflow-engine.test.mjs`

- [ ] **Step 1: Run the archive workflow test suite**

Run: `npm test`

Expected: PASS.

### Task 5: Load direct public amendments and preserve references

**Files:**
- Modify: `src/archive-workflow/workspace.js`
- Modify: `tests/clerk-native-editor-browser.test.mjs` or `tests/clerk-workflow-ui.test.mjs`
- Modify: `tests/archive-publication.test.mjs`

**Interfaces:**
- Consumes: the `palis:open-amendment` event, `client.loadArchiveEditorSource`, and the existing amendment initial-state builder.
- Produces: a prefilled amendment editor for a selected public record and an unchanged reference list after save/publish.

- [ ] **Step 1: Write failing direct-amendment and reference tests**

Dispatch a public amendment request with an archive ID and document ID; assert the editor source loader is called with that exact target and that the created document contains its fixed values, custom sections, media, and references. Render the saved document and assert its reference control still contains the original target archive ID.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `node --test tests/clerk-workflow-ui.test.mjs tests/archive-publication.test.mjs`

Expected: FAIL because the public amendment event currently creates a blank document without loading the source.

- [ ] **Step 3: Implement the shared source-loading amendment path**

Change the public amendment listener to await the selected source, load published media where applicable, pass the result through `buildAmendmentInitialState`, and use the same `references` array. Preserve a clear error state if an exact selected source is unavailable; do not substitute another document.

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `node --test tests/clerk-workflow-ui.test.mjs tests/archive-publication.test.mjs`

Expected: PASS.

- [ ] **Step 2: Build the production website**

Run: `npm run build`

Expected: Vite build succeeds.

- [ ] **Step 3: Inspect whitespace and summarize changed files**

Run: `git diff --check` and `git status --short`

Expected: no new whitespace errors; only task-related files are described in handoff.
