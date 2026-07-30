# 物种与档案主图实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让物种、事件、异常档案在保留原版版式的前提下支持主图、正文附图和图片注释。

**Architecture:** 扩展既有媒体角色而不新建上传系统；原生书记官表单复用现有媒体编辑器。正式渲染按类别读取对应主图，并仅为物种新增原版标本页渲染分支；正文附图复用现有媒体画廊并显示注释。

**Tech Stack:** Vite、原生 JavaScript、现有 archive workflow media model、Node test runner、Puppeteer。

## Global Constraints

- 保留物种、事件、异常原有正式档案视觉与 CSS 类名，不引入通用照片版式。
- 每类档案主图最多一张；正文附图可重复添加并带注释。
- 物种新建表单仅允许 `FLORA` 与 `FAUNA`；旧 `COMPOSITE` 数据仍能显示。
- 不改变组织和其他类别的表单、档案或媒体行为。
- 不提交、不暂存或覆盖工作区已有的用户改动。

---

### Task 1: 定义物种、异常与正文附图媒体角色

**Files:**
- Modify: `src/archive-workflow/media.js`
- Test: `tests/archive-media.test.mjs`

**Interfaces:**
- Consumes: `mediaPolicyFor(category)` 和既有 `defineSlot(role, field, maxCount, label)`。
- Produces: `species-cover`、`anomaly-cover`、`species-image`、`anomaly-image` 媒体角色；事件继续使用 `event-cover` 与 `event-evidence`。

- [ ] **Step 1: Write the failing test**

```js
test('species and anomaly media policies keep one cover plus repeatable captioned images', () => {
  assert.deepEqual(mediaPolicyFor('species').slots.map(({ role, maxCount }) => [role, maxCount]), [
    ['species-cover', 1], ['species-image', 6],
  ]);
  assert.deepEqual(mediaPolicyFor('anomaly').slots.map(({ role, maxCount }) => [role, maxCount]), [
    ['anomaly-cover', 1], ['anomaly-image', 6],
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/archive-media.test.mjs`

Expected: FAIL because species and anomaly policies do not expose cover and image slots.

- [ ] **Step 3: Write minimal implementation**

```js
species: { category: 'species', slots: [
  defineSlot('species-cover', 'photo', 1, '标本主图'),
  defineSlot('species-image', 'evidence', 6, '正文附图'),
] },
anomaly: { category: 'anomaly', slots: [
  defineSlot('anomaly-cover', 'photo', 1, '异常档案主图'),
  defineSlot('anomaly-image', 'evidence', 6, '正文附图'),
] },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/archive-media.test.mjs`

Expected: PASS.

### Task 2: 在书记官表单暴露类别和图片位

**Files:**
- Modify: `src/archive-workflow/category-profiles.js`
- Modify: `src/archive-workflow/native-form-profiles.js`
- Modify: `src/archive-workflow/workspace.js`
- Test: `tests/native-form-profiles.test.mjs`
- Test: `tests/clerk-native-editor-browser.test.mjs`

**Interfaces:**
- Consumes: `NATIVE_FORM_PROFILES`, existing media editor mount in workspace.
- Produces: species `specimenClass` selector limited to FLORA/FAUNA, media control mounted after custom entries for species/event/anomaly, saved media rehydration.

- [ ] **Step 1: Write the failing tests**

```js
test('species native form limits classification to flora and fauna', () => {
  const profile = getNativeFormProfile('species');
  assert.deepEqual(profile.indexFields.find(({ key }) => key === 'specimenClass').options.map(({ value }) => value), ['FLORA', 'FAUNA']);
});

test('species, event, and anomaly native forms mount a media editor after custom entries', async (t) => {
  // Create each template in the local browser fixture and assert a visible
  // [data-archive-media-editor] below [data-native-custom].
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/native-form-profiles.test.mjs tests/clerk-native-editor-browser.test.mjs`

Expected: FAIL because species still includes COMPOSITE and not every profile exposes the configured media slots.

- [ ] **Step 3: Write minimal implementation**

```js
defineIndexField('specimenClass', '植物／动物', {
  type: 'select',
  options: [
    { value: 'FLORA', label: '植物 / FLORA' },
    { value: 'FAUNA', label: '动物 / FAUNA' },
  ],
});
```

Keep the existing workspace media editor placement after the native custom-entry section and let the policy determine its slots.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/native-form-profiles.test.mjs tests/clerk-native-editor-browser.test.mjs`

Expected: PASS.

### Task 3: Render category-specific covers and captioned inline images

**Files:**
- Modify: `src/archive-workflow/public-renderer.js`
- Modify: `src/style.css`
- Test: `tests/archive-public-renderer.test.mjs`

**Interfaces:**
- Consumes: normalized document media entries with `role`, `caption`, `publicUrl` or `dataUrl`.
- Produces: `renderSpeciesMast`, `renderSpeciesPlate`, category-aware cover selection, captioned evidence gallery.

- [ ] **Step 1: Write the failing test**

```js
test('species formal records retain the specimen plate with a flora cover and captioned body image', () => {
  const html = renderFormalArchiveDocument({ archive: speciesArchive, version: speciesVersionWithMedia });
  assert.match(html, /specimen-mast[\s\S]*BOTANICAL TRACE/);
  assert.match(html, /specimen-layout[\s\S]*species-cover\.jpg/);
  assert.match(html, /正文观察图注/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/archive-public-renderer.test.mjs`

Expected: FAIL because species formal output still uses the generic header and does not select its cover role.

- [ ] **Step 3: Write minimal implementation**

```js
const preferredCoverRole = {
  event: 'event-cover',
  anomaly: 'anomaly-cover',
  species: 'species-cover',
}[document.category];
```

Build species markup from the existing original `specimen-mast` and `specimen-layout` classes. Keep anomaly and event mast markup intact; insert their one selected cover only in their existing formal layout positions. Render repeated image roles after custom sections with their captions as figure captions.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/archive-public-renderer.test.mjs`

Expected: PASS.

### Task 4: Verify visual integrity and regressions

**Files:**
- Test: `tests/clerk-native-editor-browser.test.mjs`
- Test: `tests/archive-public-renderer.test.mjs`

**Interfaces:**
- Consumes: completed native forms and public renderer.
- Produces: regression evidence for main-image rehydration, captions, original layout classes, and non-overlap at desktop and narrow widths.

- [ ] **Step 1: Add browser assertions**

```js
assert.equal(await page.$eval('[data-archive-media-editor]', (editor) => (
  editor.compareDocumentPosition(editor.closest('[data-native-form-root]').querySelector('[data-native-custom]'))
    & Node.DOCUMENT_POSITION_PRECEDING
) !== 0), true);
```

- [ ] **Step 2: Run targeted verification**

Run: `node --test tests/archive-media.test.mjs tests/native-form-profiles.test.mjs tests/archive-public-renderer.test.mjs tests/clerk-native-editor-browser.test.mjs`

Expected: PASS.

- [ ] **Step 3: Build production bundle**

Run: `npm.cmd run build`

Expected: successful Vite build; existing chunk-size warnings may remain.

- [ ] **Step 4: Inspect the changed-file diff**

Run: `git diff --check -- src/archive-workflow/media.js src/archive-workflow/category-profiles.js src/archive-workflow/native-form-profiles.js src/archive-workflow/workspace.js src/archive-workflow/public-renderer.js src/style.css`

Expected: no whitespace errors.
