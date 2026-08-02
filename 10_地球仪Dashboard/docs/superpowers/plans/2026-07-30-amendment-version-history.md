# Amendment Version History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render approved amendments as the current archive content and expose only their changed fields through clickable version-history dialogs.

**Architecture:** A pure publication helper will fold the base document and chronologically approved amendments into a current document plus per-amendment diffs. The ledger renders that current document once, with version rows carrying the prepared diff data. The archive window owns one accessible modal for viewing selected diffs.

**Tech Stack:** Vanilla JavaScript modules, existing Node test runner, DOM browser regression tests, existing CSS.

## Global Constraints

- Do not migrate, mutate, or discard already published amendment data.
- Only fields changed by a specific amendment appear in that amendment's history view.
- The original record remains an internal merge base and is not a history row.
- Preserve the existing archive visual language and formal renderer.

---

### Task 1: Derive the current document and amendment diffs

**Files:**
- Modify: `src/archive-workflow/publication.js`
- Test: `tests/archive-record-tree.test.mjs`

**Interfaces:**
- Produces `buildAmendmentTimeline(baseVersion, amendments)`, returning `{ currentVersion, history }`.
- Each `history` entry contains `amendment`, `version`, and `changes: Array<{ label, before, after }>`.

- [ ] **Step 1: Write the failing test**

```js
const timeline = buildAmendmentTimeline(records[0].versions[0], [amendment]);
assert.equal(timeline.currentVersion.content.values.hero, 'amendment-1');
assert.deepEqual(timeline.history[0].changes, [{
  label: 'hero',
  before: 'record-1',
  after: 'amendment-1',
}]);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/archive-record-tree.test.mjs`
Expected: FAIL because `buildAmendmentTimeline` is not exported.

- [ ] **Step 3: Write minimal implementation**

```js
export function buildAmendmentTimeline(baseVersion, amendments) {
  let currentVersion = clone(baseVersion);
  const history = amendments.map((amendment) => {
    const version = amendment.latestVersion;
    const changes = diffDocuments(currentVersion.content, version.content);
    currentVersion = { ...currentVersion, content: mergeDocuments(currentVersion.content, version.content) };
    return { amendment, version, changes };
  });
  return { currentVersion, history };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/archive-record-tree.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/archive-workflow/publication.js tests/archive-record-tree.test.mjs
git commit -m "feat: merge published amendments into records"
```

### Task 2: Render clickable history instead of inline amendments

**Files:**
- Modify: `src/archive-workflow/publication.js`
- Modify: `src/style.css`
- Test: `tests/archive-record-tree.test.mjs`

**Interfaces:**
- Consumes timeline `history` from Task 1.
- Produces `data-open-amendment-history="<amendment id>"` buttons and hidden `data-amendment-history-detail` payloads.

- [ ] **Step 1: Write the failing test**

```js
assert.match(rendered, /data-open-amendment-history="amendment-1"/);
assert.match(rendered, /data-amendment-history-detail="amendment-1"/);
assert.doesNotMatch(rendered, /data-amendment-for="record-1"/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/archive-record-tree.test.mjs`
Expected: FAIL because the ledger still renders `data-amendment-for`.

- [ ] **Step 3: Write minimal implementation**

```js
const renderVersionHistory = (history) => `<ol>${history.map(({ amendment, version }) =>
  `<li><button data-open-amendment-history="${amendment.id}">VER ${version.version_label}</button></li>`
).join('')}</ol>`;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/archive-record-tree.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/archive-workflow/publication.js src/style.css tests/archive-record-tree.test.mjs
git commit -m "feat: show amendment history in version list"
```

### Task 3: Open history changes in an accessible modal

**Files:**
- Modify: `src/main.js`
- Modify: `src/style.css`
- Test: `tests/clerk-native-editor-browser.test.mjs`

**Interfaces:**
- Consumes `data-open-amendment-history` and `data-amendment-history-detail`.
- Produces a modal with `data-amendment-history-modal`, close control, Escape handling, and focus restoration.

- [ ] **Step 1: Write the failing browser test**

```js
await clickControl(page, '[data-open-amendment-history]');
await page.waitForSelector('[data-amendment-history-modal]:not([hidden])');
assert.equal(await page.$eval('[data-amendment-history-modal]', node => node.textContent.includes('修改前')), true);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/clerk-native-editor-browser.test.mjs`
Expected: FAIL because no modal is rendered.

- [ ] **Step 3: Write minimal implementation**

```js
sheet.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-open-amendment-history]');
  if (trigger) openAmendmentHistoryModal(sheet, trigger);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/clerk-native-editor-browser.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main.js src/style.css tests/clerk-native-editor-browser.test.mjs
git commit -m "feat: open amendment history dialog"
```

### Task 4: Verify the release

**Files:**
- Verify: `tests/*.test.mjs`

- [ ] **Step 1: Run the complete test suite**

Run: `npm.cmd test`
Expected: PASS with zero failures.

- [ ] **Step 2: Build the website**

Run: `npm.cmd run build`
Expected: exit code 0.

- [ ] **Step 3: Commit the complete implementation**

```bash
git add src/archive-workflow/publication.js src/main.js src/style.css tests/archive-record-tree.test.mjs tests/clerk-native-editor-browser.test.mjs
git commit -m "feat: merge archive amendments into version history"
```
