# Organization and Event Original Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render organization and event formal archives with their existing original archive-system layouts while retaining clerk-entered fields, stamps, and end-of-body image captions.

**Architecture:** Keep `public-renderer.js` as the single formal-rendering adapter. Add category-specific mast and dossier functions that emit the same structural classes as the static archive renderer in `main.js`: `chain-mast / chain-columns` for organizations and `reel-mast / reel-transcript` for events. The existing generic formal mast and top metadata remain hidden for these two specialized categories; page-footer metadata and the current media gallery are retained.

**Tech Stack:** Vanilla ES modules, HTML template strings, CSS, Node test runner, Vite.

## Global Constraints

- Reuse existing original CSS classes and visual language; do not introduce a new layout, gradient, or animation.
- Do not modify saved archive content or remove existing image-caption support.
- Keep registration stamps visible without overlapping the title or date.
- Keep general metadata only in the footer for organization and event pages.
- Verify rendering with focused Node tests and a production Vite build.

---

### Task 1: Lock the original-structure contract in tests

**Files:**
- Modify: `tests/archive-public-renderer.test.mjs`
- Modify: `tests/archive-workspace-media.test.mjs` only if a current expectation relies on the removed generic header

**Interfaces:**
- Consumes: `renderFormalArchiveDocument({ archive, contribution, version, preview })`
- Produces: rendering assertions that require original organization and event structural classes.

- [ ] **Step 1: Write failing organization and event layout assertions**

```js
assert.match(organizationHtml, /class="chain-mast"/);
assert.match(organizationHtml, /class="chain-columns"/);
assert.doesNotMatch(organizationHtml, /archive-formal-document__mast--generic/);

assert.match(eventHtml, /class="reel-mast"/);
assert.match(eventHtml, /class="reel-transcript"/);
assert.doesNotMatch(eventHtml, /archive-formal-document__mast--generic/);
assert.match(eventHtml, /archive-registration-stamp/);
```

- [ ] **Step 2: Run the renderer tests to verify they fail**

Run: `node --test tests/archive-public-renderer.test.mjs`

Expected: FAIL because the formal renderer still emits `archive-formal-document__mast--organization` or `archive-formal-document__mast--event` instead of the two original structures.

- [ ] **Step 3: Keep the examples complete**

```js
// Organization fixture includes the six fixed dossier values and one custom entry.
// Event fixture includes mission date, six fixed dossier values, one image caption,
// and one custom report entry.
```

- [ ] **Step 4: Re-run to retain the baseline failure before implementation**

Run: `node --test tests/archive-public-renderer.test.mjs`

Expected: the two new original-layout assertions fail while existing tests remain readable.

### Task 2: Render organization and event pages with their original mast and dossier structures

**Files:**
- Modify: `src/archive-workflow/public-renderer.js`
- Test: `tests/archive-public-renderer.test.mjs`

**Interfaces:**
- Consumes: `document.values`, `document.title`, `archive.code`, `archive.sequence_number`, `version.version_label`, and `document.media`.
- Produces: `renderOrganizationMast`, `renderOrganizationDossier`, `renderEventMast`, and `renderEventDossier` markup inside `renderFormalArchiveDocument`.

- [ ] **Step 1: Write the minimal original-layout functions**

```js
const renderOrganizationMast = (document, archive) => `
  <header class="chain-mast">
    <p class="dialog-meta">INSTITUTIONAL CHAIN LEDGER / ${escapeHtml(archive.code)}</p>
    <h2>${escapeHtml(document.title)}</h2>
  </header>
`;

const renderOrganizationDossier = (document) => `
  <div class="chain-columns">
    <p class="record-format">MANDATE / AUTHORITY / SOURCE CHAIN</p>
    <dl class="record-fields">${organizationRows(document)}</dl>
  </div>
`;
```

- [ ] **Step 2: Render the original event equivalents**

```js
const renderEventMast = (document, archive, version, preview) => `
  <header class="reel-mast">
    <div><p class="dialog-meta">DEEP ARCHIVE EVENT RECORD / ${escapeHtml(archive.code)}</p><h2>${escapeHtml(document.title)}</h2></div>
    <div><b>${escapeHtml(eventStartDateLabel(document.values.missionDate))}</b><b class="archive-registration-stamp">VER ${escapeHtml(version.version_label || '0.1')}</b></div>
  </header>
`;
```

- [ ] **Step 3: Remove the generic header from specialized markup, not only visually**

```js
const isSpecialized = isOrganization || isEvent || isAnomaly || isSpecies;
${isSpecialized ? '' : renderGenericMast(...) }
${isSpecialized ? '' : renderTopMetadata(...) }
```

- [ ] **Step 4: Preserve page-footer metadata and body media galleries**

```js
${renderSections(document, { includeEventDossier: !isEvent })}
${renderEvidenceGallery(document)}
${metadata}
```

- [ ] **Step 5: Run the focused renderer test**

Run: `node --test tests/archive-public-renderer.test.mjs`

Expected: PASS; organization and event show the original classes, their form values, the event stamp, and image captions.

### Task 3: Fit the stamp and responsive layout into the existing original CSS

**Files:**
- Modify: `src/style.css`
- Test: `tests/archive-public-renderer.test.mjs`

**Interfaces:**
- Consumes: `chain-mast`, `chain-columns`, `reel-mast`, `reel-transcript`, and `archive-registration-stamp` markup.
- Produces: non-overlapping header marker placement at desktop and narrow widths.

- [ ] **Step 1: Add only category-scoped stamp layout rules**

```css
.archive-formal-document--event .reel-mast > div:last-child {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 18px;
}
.archive-formal-document--event .reel-mast .archive-registration-stamp {
  max-width: 190px;
  flex: 0 1 190px;
}
```

- [ ] **Step 2: Preserve original mobile collapse behavior**

```css
@media (max-width: 720px) {
  .archive-formal-document--event .reel-mast,
  .archive-formal-document--organization .chain-mast { align-items: flex-start; }
  .archive-formal-document--event .reel-mast > div:last-child { justify-content: flex-start; flex-wrap: wrap; }
}
```

- [ ] **Step 3: Confirm the layout test suite remains green**

Run: `node --test tests/archive-public-renderer.test.mjs`

Expected: PASS.

### Task 4: Verify the full archive workflow build

**Files:**
- Test: `tests/archive-public-renderer.test.mjs`
- Test: `tests/native-form-profiles.test.mjs`
- Test: `tests/archive-workspace-media.test.mjs`

**Interfaces:**
- Consumes: current formal renderer, native form profile adapter, and media workspace renderer.
- Produces: validated build with no formatting errors.

- [ ] **Step 1: Run focused workflow tests**

Run: `node --test tests/archive-public-renderer.test.mjs tests/native-form-profiles.test.mjs tests/archive-workspace-media.test.mjs`

Expected: PASS.

- [ ] **Step 2: Check whitespace and build production assets**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `npm.cmd run build`

Expected: Vite exits successfully.

- [ ] **Step 3: Commit only if the user explicitly authorizes it**

```bash
git add src/archive-workflow/public-renderer.js src/style.css tests/archive-public-renderer.test.mjs
git commit -m "fix: reuse original organization and event archive layouts"
```
