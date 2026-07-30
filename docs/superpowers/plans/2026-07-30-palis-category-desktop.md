# PALIS Category Desktop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the nine archive categories the clerk desktop’s direct vertical entry points, with category-scoped modification and independent new documents under any existing archive of the selected category.

**Architecture:** `index.html` exposes one desktop command per `ARCHIVE_TEMPLATES` category. `workspace.js` resolves that command to a category operation window, then delegates to scoped new or modify flows. A new existing-archive document uses the existing `contribution` kind, while an amendment keeps using `amendment` against one chosen document.

**Tech Stack:** Vite, vanilla JavaScript, CSS, Playwright browser tests, Node test runner, local IndexedDB and Supabase repository adapters.

## Global Constraints

- Keep the administrator review, approval, return-for-changes, publication, permissions, animation, drag, and wheel behavior unchanged.
- Preserve all existing archive data; do not migrate or overwrite existing contributions.
- A returned `new` or `contribution` draft belongs to the selected category’s New action; a returned `amendment` belongs to Modify. This applies to all nine categories.
- Do not stage or modify unrelated existing worktree files.

---

### Task 1: Lock the new desktop and contribution behavior with browser tests

**Files:**
- Modify: `tests/clerk-native-editor-browser.test.mjs`

**Interfaces:**
- Consumes: desktop commands named `archive-category:<template code>`.
- Produces: regression coverage for category order, vertical shortcut layout hooks, action ordering, and independent documents bound to an existing archive.

- [ ] **Step 1: Write failing desktop-entry test**

```js
await openWorkspace(page);
const categories = await page.$$eval('[data-workspace-command^="archive-category:"]', (buttons) =>
  buttons.map((button) => button.dataset.workspaceCommand));
assert.deepEqual(categories, [
  'archive-category:01', 'archive-category:02', 'archive-category:03',
  'archive-category:04', 'archive-category:05', 'archive-category:06',
  'archive-category:07', 'archive-category:08', 'archive-category:09',
]);
assert.equal(await page.$('[data-workspace-command="new-archive"]'), null);
assert.equal(await page.$('[data-workspace-command="modify-archive"]'), null);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test --test-name-pattern="category desktop" tests/clerk-native-editor-browser.test.mjs`

Expected: FAIL because category desktop commands do not exist.

- [ ] **Step 3: Write failing category-action and independent-document test**

```js
await openDesktopCommand(page, 'archive-category:07');
await page.waitForSelector('[data-category-archive-actions="07"]');
assert.equal(await page.$eval('[data-category-action="modify"]', (node) => node.compareDocumentPosition(
  document.querySelector('[data-category-action="new"]'),
) & Node.DOCUMENT_POSITION_FOLLOWING), Node.DOCUMENT_POSITION_FOLLOWING);

await clickControl(page, '[data-category-action="new"]');
await clickControl(page, `[data-new-contribution-archive="${fixture.referenceArchive.id}"]`);
assert.equal(await page.$eval('[data-archive-editor]', (form) => form.dataset.editorKind), 'contribution');
```

- [ ] **Step 4: Run it to verify it fails**

Run: `node --test --test-name-pattern="independent archive document" tests/clerk-native-editor-browser.test.mjs`

Expected: FAIL because New has no existing-archive contribution choice.

- [ ] **Step 5: Keep this test task uncommitted until all implementation tasks pass**

No git staging in this task because the working tree already contains the user’s active PALIS changes.

### Task 2: Replace action-first desktop shortcuts with nine vertical category icons

**Files:**
- Modify: `index.html:281-304`
- Modify: `src/style.css:8099-8209, 8459-8475, 8532-8590, 8688-8704, 8750-8880`

**Interfaces:**
- Consumes: the nine `ARCHIVE_TEMPLATES` codes and the `palis:workspace-command` event.
- Produces: `[data-workspace-command="archive-category:<code>"]` desktop buttons and a one-column icon rail.

- [ ] **Step 1: Replace the two global archive shortcut buttons with nine category buttons**

```html
<button type="button" data-clerk-desktop-entry data-workspace-shortcut
  data-workspace-command="archive-category:07" data-archive-category="event">
  <i class="clerk-desktop__icon clerk-desktop__icon--event" aria-hidden="true"></i>
  <span>事件档案</span>
</button>
```

Repeat in template-code order `01` through `09`, using a different modifier class per category. Remove the two global desktop buttons and their Start-menu equivalents.

- [ ] **Step 2: Add category-icon styling and force a vertical desktop rail**

```css
.clerk-desktop__icons[data-archive-category-rail] {
  grid-template-columns: 1fr;
  grid-auto-flow: row;
  max-height: calc(100% - var(--desktop-taskbar-height) - 32px);
  overflow-y: auto;
}
.clerk-desktop__icon--event::before { /* pixel event glyph */ }
```

Keep the existing classic selected state and use 95-style bevels, compact pixels, and category accent colors. Make narrow layouts remain vertical rather than returning to multi-column mobile grids.

- [ ] **Step 3: Run the desktop-entry test**

Run: `node --test --test-name-pattern="category desktop" tests/clerk-native-editor-browser.test.mjs`

Expected: PASS.

### Task 3: Add a category operation window and route the two actions

**Files:**
- Modify: `src/archive-workflow/workspace.js:435-440, 1929-2319, 3000-3083`
- Modify: `src/archive-workflow/workspace.css`
- Test: `tests/clerk-native-editor-browser.test.mjs`

**Interfaces:**
- Consumes: `openCategoryArchiveActions(template)` and `archive-category:<code>` commands.
- Produces: `data-category-archive-actions="<code>"`, `data-category-action="modify"`, and `data-category-action="new"`.

- [ ] **Step 1: Add category action entry point**

```js
const openCategoryArchiveActions = (template) => createWindow({
  key: `archive-category-actions-${template.code}`,
  title: `${template.title} / 档案操作`,
  code: `ARCHIVE_${template.code}`,
  className: 'archive-category-actions-window',
  body: `<div data-category-archive-actions="${escapeHtml(template.code)}">...</div>`,
});
```

Render Modify first, then New. Both buttons keep the selected template code in `data-template-code`.

- [ ] **Step 2: Scope existing chooser functions to an optional template**

```js
const openNewArchiveChooser = async (template = null) => { /* skip category screen when template exists */ };
const openModifyArchiveChooser = async (template = null) => { /* load only template.category */ };
```

When scoped, their back controls return to the category action window. Keep no-argument behavior only for internal compatibility until all command callers move.

- [ ] **Step 3: Route category desktop commands**

```js
if (command.startsWith('archive-category:')) {
  const template = ARCHIVE_TEMPLATE_BY_CODE[command.slice('archive-category:'.length)];
  if (template) void openCategoryArchiveActions(template);
}
```

- [ ] **Step 4: Classify contribution drafts as New**

```js
export const buildClerkDraftPlacement = (draft = {}) => ({
  action: ['new', 'contribution'].includes(draft.kind) ? 'new' : 'modify',
  // existing placement properties
});
```

This keeps returned independent documents under the category New action while amendments remain under Modify.

- [ ] **Step 5: Run category action tests**

Run: `node --test --test-name-pattern="category desktop|category action" tests/clerk-native-editor-browser.test.mjs`

Expected: PASS.

### Task 4: Allow New to add an independent document inside a published archive

**Files:**
- Modify: `src/archive-workflow/workspace.js:1940-2017`
- Modify: `tests/clerk-native-editor-browser.test.mjs`
- Test: `tests/local-workflow-engine.test.mjs`

**Interfaces:**
- Consumes: category-scoped `client.listEditableArchives({ category })` and `createEditor(template, initial)`.
- Produces: editor state `{ kind: 'contribution', archiveId }` for an independent document under an existing archive.

- [ ] **Step 1: In the scoped New chooser, show both possible targets**

```js
<button type="button" data-new-independent-template="07">建立新的事件档案</button>
<button type="button" data-new-contribution-archive="${archive.id}">
  <b>${archive.code} / ${archive.title}</b><span>在此档案内新增独立正文</span>
</button>
```

Load only archives matching `template.category`. Returned drafts with `kind === 'new'` appear under the independent target; returned drafts with `kind === 'contribution'` appear beside their bound archive and retain the review reason.

- [ ] **Step 2: Create a blank independent-document editor without a target document**

```js
const editor = await createEditor(template, {
  kind: 'contribution',
  archiveId: archive.id,
  title: archive.title,
  sourceArchive: archive,
});
```

Do not set `targetContributionId` or `baseVersionId`; that distinction keeps it separate from an amendment.

- [ ] **Step 3: Add a local workflow test for two published independent documents in one archive**

```js
const second = await harness.repository.saveDraft({
  ownerId: 'clerk-2', templateId: '07', archiveId: 'archive-1', kind: 'contribution',
  title: 'HZ-6 第二份正文', content: validEventDocument,
});
await harness.repository.submitDraft(second.id, 'clerk-2');
await harness.repository.reviewSubmission(second.id, { decision: 'approved', message: '通过' });
await harness.repository.publishContribution(second.id, { category: 'event' });
assert.equal((await harness.repository.listArchiveDocuments('archive-1')).length, 2);
```

- [ ] **Step 4: Run contribution tests**

Run: `node --test --test-name-pattern="independent archive document" tests/clerk-native-editor-browser.test.mjs && node --test --test-name-pattern="independent documents" tests/local-workflow-engine.test.mjs`

Expected: PASS, with both documents listed under the same archive and each preserving its own author/version chain.

### Task 5: Regression verification and build

**Files:**
- Verify: `tests/clerk-native-editor-browser.test.mjs`
- Verify: `tests/local-workflow-engine.test.mjs`
- Verify: `tests/clerk-workspace.test.mjs`
- Verify: `tests/workspace-narrow-controls.test.mjs`

- [ ] **Step 1: Run focused workflow suites**

Run: `node --test tests/clerk-native-editor-browser.test.mjs tests/local-workflow-engine.test.mjs tests/clerk-workspace.test.mjs tests/workspace-narrow-controls.test.mjs`

Expected: PASS.

- [ ] **Step 2: Build the production site**

Run: `npm.cmd run build`

Expected: Vite build succeeds.

- [ ] **Step 3: Check patch hygiene**

Run: `git diff --check`

Expected: no whitespace errors.
