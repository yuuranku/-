# Organization Clerk Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give organization clerks six optional fixed fields plus repeatable titled entries that render in the formal published dossier.

**Architecture:** `native-form-profiles.js` owns the field contract and persistence. `public-renderer.js` maps the same persisted document keys into the existing organization document layout; `workspace.js` and its CSS expose the compact editable controls without changing approval or publication flow.

**Tech Stack:** Vite, browser-native HTML, Node test runner, existing archive workflow.

## Global Constraints

- Modify only the organization form and its published rendering path.
- Fixed fields are optional and empty values are hidden from published output.
- Keep existing drafts, legacy fields, and all other archive categories compatible.
- Do not add animation or dependencies.

---

### Task 1: Establish the organization document contract

**Files:**
- Modify: `tests/native-form-profiles.test.mjs`
- Modify: `src/archive-workflow/native-form-profiles.js`

**Interfaces:**
- Produces organization `coreFields` in this order: `institutionNumber`, `activePeriod`, `organizationNature`, `powerStructure`, `standingDepartments`, `frontlineUnits`.
- Produces `custom:item:<id>:title|content` persisted values.

- [ ] **Step 1: Write the failing test**

```js
const profile = getNativeFormProfile('organization');
assert.deepEqual(profile.coreFields.map(({ key }) => key), [
  'institutionNumber', 'activePeriod', 'organizationNature',
  'powerStructure', 'standingDepartments', 'frontlineUnits',
]);
assert.equal(profile.coreFields.every(({ required }) => required === false), true);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- tests/native-form-profiles.test.mjs`

- [ ] **Step 3: Write minimal implementation**

```js
organization: nativeDefinition('organization', [
  defineField('institutionNumber', '机构号', { required: false }),
  defineField('activePeriod', '适用年代', { required: false }),
  defineField('organizationNature', '组织性质', { required: false }),
  defineField('powerStructure', '权力结构', { required: false }),
  defineField('standingDepartments', '常设部门', { required: false }),
  defineField('frontlineUnits', '前线机构', { required: false }),
]),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- tests/native-form-profiles.test.mjs`

### Task 2: Render submitted organization data as the formal dossier

**Files:**
- Modify: `tests/archive-public-renderer.test.mjs`
- Modify: `src/archive-workflow/public-renderer.js`

**Interfaces:**
- Consumes `custom:item:<id>:title|content` and legacy `label|value` custom keys.
- Produces non-empty custom entries as formal `record-chapter` sections.

- [ ] **Step 1: Write the failing test**

```js
const html = renderFormalArchiveDocument({ archive, contribution, version });
assert.match(html, /机构定位/);
assert.match(html, /直属于联合档案处/);
assert.doesNotMatch(html, /空置字段/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- tests/archive-public-renderer.test.mjs`

- [ ] **Step 3: Write minimal implementation**

```js
const customEntryKey = /^(?:amendment|custom):item:([^:]+):(label|value|title|content)$/;
// Normalize label/title to `label`, and value/content to `value` before rendering.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- tests/archive-public-renderer.test.mjs`

### Task 3: Make the clerk form clear and verify its end-to-end behavior

**Files:**
- Modify: `src/archive-workflow/workspace.js`
- Modify: `src/archive-workflow/workspace.css`
- Modify: `tests/clerk-native-editor-browser.test.mjs`

- [ ] **Step 1: Write the failing browser assertion**

```js
await clickControl(page, '[data-add-native-custom-entry]');
assert.equal(await page.locator('[data-native-custom-entry]').count(), 1);
assert.match(await page.locator('[data-formal-section="custom-entries"]').textContent(), /机构定位/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- tests/clerk-native-editor-browser.test.mjs`

- [ ] **Step 3: Write minimal implementation**

```js
// Preserve the existing add/remove handlers. Label organization fixed fields as
// “基础资料 / BASE INFORMATION” and custom entries as “自定义条目 / CUSTOM ENTRIES”.
```

- [ ] **Step 4: Run focused tests, then the complete suite and production build**

Run: `npm.cmd test -- tests/native-form-profiles.test.mjs tests/archive-public-renderer.test.mjs tests/clerk-native-editor-browser.test.mjs`

Run: `npm.cmd test`

Run: `npm.cmd run build`

### Task 4: Prefill modification drafts from an existing organization record

**Files:**
- Modify: `tests/archive-workflow-repository-shapes.test.mjs`
- Modify: `src/archive-workflow/official-archive-source.js`

**Interfaces:**
- Consumes an existing organization archive code and its authored source data.
- Produces the six fixed values, the red/blue/neutral category, and ordered `custom:item:<id>:title|content` values for the native editor.

- [ ] **Step 1: Write the failing test**

```js
const draft = toEditorDocumentFromArchiveBase({ code: 'O02', category: 'organization' }, null, template02);
assert.equal(draft.values.institutionNumber, 'O02');
assert.equal(draft.indexData.channel, 'red');
assert.equal(draft.values['custom:item:section-1:title'], '机构定位');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/archive-workflow-repository-shapes.test.mjs`

- [ ] **Step 3: Write minimal implementation**

```js
// Map only the source's explicitly named organization facts into the six
// stable fields. Keep summaries and heading-led source blocks as custom
// title/content entries, preserving their order and text.
```

- [ ] **Step 4: Run focused tests and production build**

Run: `node --test tests/archive-workflow-repository-shapes.test.mjs tests/native-form-profiles.test.mjs tests/archive-public-renderer.test.mjs`

Run: `npm.cmd run build`
