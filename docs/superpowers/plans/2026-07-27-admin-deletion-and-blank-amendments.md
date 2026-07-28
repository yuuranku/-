# 管理员删除与自由修订页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理员能检索并永久删除任意正式档案；科考站点、白幕入口仅可修订既有档案，且所有修订使用可添加自定义条目的空白补充页。

**Architecture:** 复用现有 `archives_admin_write` RLS 策略，在浏览器 Supabase 客户端添加管理员全档案查询和删除方法；工作台把该能力放到一个管理员专用的档案管理窗口。修订编辑器继续保存到 `draft_content`，但在修订模式切换到新的、同源 iframe 空白模板，复用现有编辑桥的读写与自动保存机制。

**Tech Stack:** Vite、原生 ES Modules、Supabase JS、Postgres RLS、Node test runner、HTML/CSS。

## Global Constraints

- 管理员删除为永久操作，必须在客户端核对输入的正式档案编号后才发请求。
- 不新增 service-role 密钥、数据库迁移、Edge Function 或新的生产部署权限。
- 非管理员只能使用现有档案阅读/投稿能力，不能看见或调用管理员删除操作。
- 科考站点 `station` 和白幕入口 `entrance` 没有新建或普通补充模式，只能提交修订。
- 修订内容使用 `draft_content.schemaVersion = 2`，并保留既有引用、附件、自动保存和审核流程。

---

### Task 1: 管理员档案查询与删除客户端边界

**Files:**
- Modify: `src/archive-workflow/client.js`
- Modify: `tests/archive-workflow-client.test.mjs`

**Interfaces:**
- Produces `listAdminArchives({ query, limit })`, returning every visibility state sorted by `published_at`.
- Produces `deleteArchive(archiveId)`, issuing `from('archives').delete().eq('id', archiveId).select('id,code,title').single()`.

- [ ] **Step 1: Write the failing tests**

```js
test('administrator archive client queries every visibility state and deletes a selected archive', async () => {
  const calls = [];
  const client = createArchiveWorkflowClient(fakeSupabase(calls));
  await client.listAdminArchives({ query: 'TEST-01' });
  await client.deleteArchive('archive-01');
  assert.equal(calls[0].table, 'archives');
  assert.equal(calls[0].operation, 'select');
  assert.equal(calls[1].operation, 'delete');
  assert.deepEqual(calls[1].filters, [['id', 'archive-01']]);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test tests/archive-workflow-client.test.mjs`

Expected: FAIL because `listAdminArchives` and `deleteArchive` do not exist.

- [ ] **Step 3: Implement the minimal client methods**

```js
const listAdminArchives = ({ query = '', limit = 100 } = {}) => {
  let request = supabase.from('archives').select(ARCHIVE_LIST_COLUMNS)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(Math.min(Math.max(Number(limit) || 100, 1), 100));
  if (term) request = request.or(`code.ilike.%${term}%,title.ilike.%${term}%`);
  return unwrap(request, 'Unable to load administrator archive directory');
};

const deleteArchive = (archiveId) => unwrap(
  supabase.from('archives').delete().eq('id', requireId(archiveId, 'archiveId'))
    .select('id,code,title').single(),
  'Unable to delete archive',
);
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `node --test tests/archive-workflow-client.test.mjs`

Expected: PASS.

### Task 2: 管理员档案管理窗口与删除确认

**Files:**
- Modify: `index.html`
- Modify: `src/archive-workflow/workspace.js`
- Modify: `src/archive-workflow/workspace.css`
- Modify: `tests/archive-admin-workflow.test.mjs`

**Interfaces:**
- Consumes `client.listAdminArchives()` and `client.deleteArchive(archiveId)` from Task 1.
- Produces a `data-workflow-panel="archives"` button visible only through the existing `data-admin-only` gate.
- Produces `openArchiveManagementPanel()` that requires `canReview(context.role)`.

- [ ] **Step 1: Write the failing behavior tests**

```js
test('administrator workspace exposes an archive manager with typed-code permanent deletion', () => {
  assert.match(html, /data-workflow-panel="archives"[^>]*data-admin-only/);
  assert.match(workspace, /listAdminArchives/);
  assert.match(workspace, /data-delete-archive-confirmation/);
  assert.match(workspace, /deleteArchive\(archiveId\)/);
  assert.match(workspace, /palis:archive-directory-changed/);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test tests/archive-admin-workflow.test.mjs`

Expected: FAIL because the archive panel and delete confirmation do not exist.

- [ ] **Step 3: Implement the smallest safe management flow**

Add a fifth utility button for `archives`. In `openArchiveManagementPanel`, render a search field and cards showing code, title, category, visibility and publication time. Clicking delete opens an inline confirmation panel with the exact code in the prompt and a `data-delete-archive-confirmation` input. Only call `client.deleteArchive` when `input.value.trim() === archive.code`; then reload the list and dispatch `new CustomEvent('palis:archive-directory-changed', { detail: { archiveId, code } })`.

- [ ] **Step 4: Add focused CSS for the management list and destructive confirmation**

Use the existing window colors, make the records list scroll inside the window, and reserve the red delete action for the confirmation state only. Add the high-resolution type rules in the existing `min-width: 1600px` block.

- [ ] **Step 5: Run the focused test and verify it passes**

Run: `node --test tests/archive-admin-workflow.test.mjs`

Expected: PASS.

### Task 3: 可复用的空白修订页面与自定义条目桥接

**Files:**
- Create: `public/templates/10-自由修订补充页.html`
- Modify: `src/archive-workflow/editor-bridge.js`
- Modify: `tests/archive-editor-bridge.test.mjs`

**Interfaces:**
- The blank page exposes `data-save="amendment:title"`, `data-save="amendment:body"`, and dynamic `data-save="amendment:item:<id>"` nodes.
- `writeTemplateDocument(root, value)` restores dynamic amendment nodes before setting their values.
- The iframe emits standard `input` events for added and removed custom entries so the current autosave bridge captures them.

- [ ] **Step 1: Write a failing bridge test for restoring dynamic amendment entries**

```js
test('freeform amendment page restores every saved custom item before writing values', () => {
  const root = createBlankAmendmentDocument();
  writeTemplateDocument(root, {
    templateCode: '03',
    values: {
      'amendment:title': '补充记录',
      'amendment:item:field-1': '新坐标',
    },
  });
  assert.equal(root.querySelector('[data-save="amendment:item:field-1"]').textContent, '新坐标');
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test tests/archive-editor-bridge.test.mjs`

Expected: FAIL because the blank template and dynamic-node restoration hook do not exist.

- [ ] **Step 3: Create the blank, same-origin amendment page**

Create a minimal print-style document with a read-only archive-context header, contenteditable supplement title/body, an “添加条目” button, and row controls. The page script must create stable `amendment:item:<crypto-random-id>` keys, expose `window.syncAmendmentItems(values)`, and dispatch bubbling `input` events after adding or deleting a row.

- [ ] **Step 4: Add the bridge restoration hook**

Before iterating `[data-save]`, call `root.defaultView?.syncAmendmentItems?.(document.values)`. This leaves the nine existing static templates unchanged while allowing the blank page to recreate saved dynamic fields.

- [ ] **Step 5: Run the focused test and verify it passes**

Run: `node --test tests/archive-editor-bridge.test.mjs`

Expected: PASS.

### Task 4: 将修订模式切换为空白页并限制固定类别

**Files:**
- Modify: `src/archive-workflow/workspace.js`
- Modify: `tests/clerk-workflow-ui.test.mjs`
- Modify: `tests/archive-admin-workflow.test.mjs`

**Interfaces:**
- `isFixedArchiveCategory(category)` returns true only for `station` and `entrance`.
- `amendmentTemplatePreviewUrl(template)` resolves `public/templates/10-自由修订补充页.html`.
- `createEditor(template, initial)` starts fixed categories in `kind: 'amendment'` and removes `new`/`contribution` choices.

- [ ] **Step 1: Write failing behavior tests**

```js
test('station and entrance start as amendment-only editors while every amendment loads the blank supplement page', () => {
  assert.match(workspace, /isFixedArchiveCategory/);
  assert.match(workspace, /template\.category === 'station'/);
  assert.match(workspace, /template\.category === 'entrance'/);
  assert.match(workspace, /10-自由修订补充页\.html/);
});
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `node --test tests/clerk-workflow-ui.test.mjs tests/archive-admin-workflow.test.mjs`

Expected: FAIL because fixed categories can still be created and amendment mode retains the category template iframe.

- [ ] **Step 3: Implement mode-dependent iframe creation**

Set fixed-category initial mode to `amendment`. Render only the amendment option for them. When amendment mode is active, instantiate the editor bridge with the blank-page iframe source; when a non-fixed editor changes modes, dispose the old bridge, preserve `editorDocument`, switch the iframe source, and instantiate the replacement bridge. Keep the selected original archive required in amendment mode.

- [ ] **Step 4: Preserve the amendment document on archive selection**

Update `applySelectedArchive` so it records the selected archive’s code, formal number, target contribution and base version without overwriting the blank amendment values. Its context remains in the left rail; the right page remains the contributor’s supplement.

- [ ] **Step 5: Run focused tests and verify they pass**

Run: `node --test tests/clerk-workflow-ui.test.mjs tests/archive-admin-workflow.test.mjs`

Expected: PASS.

### Task 5: Regression verification

**Files:**
- Modify only files required by failing tests from Tasks 1–4.

- [ ] **Step 1: Run the complete test suite**

Run: `npm.cmd test`

Expected: all tests PASS.

- [ ] **Step 2: Build the Vite production bundle**

Run: `npm.cmd run build`

Expected: exit code 0; record any size warning as non-fatal.

- [ ] **Step 3: Inspect the working tree**

Run: `git status --short --branch`

Expected: identify this feature’s changes without staging, committing, discarding, or deploying unrelated user changes.

- [ ] **Step 4: Manual acceptance path**

Log in as administrator, open 档案管理, search a test archive, verify a wrong confirmation code does nothing, then enter the exact code and verify the record leaves both the manager and its public category after a refresh. Log in as a clerk, open a station/entrance icon, verify only an existing archive can be selected and the right canvas is the blank supplement page; open an amendment for another category and verify custom entries survive save/reopen.
