# 科考站与白幕入口工作台接入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让既有的 20 份科考站与 18 份白幕入口档案进入管理员、书记官的真实工作流，同时限制书记官不能为这两类新建，并在档案管理中按九类左侧标签筛选。

**Architecture:** 用现有的 `ARCHIVE_ROOTS` 静态目录生成可编辑的官方基础档案：本地 IndexedDB 在读写前幂等补齐，Supabase 通过一次性迁移补齐同一批记录。工作台依据角色与模板代码限制新增入口；管理员档案管理窗口改为左侧九类标签加右侧列表，不改变删除、新标记和搜索操作。

**Tech Stack:** Vanilla ES modules、IndexedDB、本地工作流引擎、Supabase SQL migrations、Node test、Puppeteer。

## Global Constraints

- 03（科考站）和 04（白幕入口）仅对 `clerk` 隐藏并拒绝新增，`admin` 保持新增与修改。
- 所有基线档案为 `public`、`official`，不得伪造书记官提交、审核记录或初始版本。
- 本地补齐必须对既有 IndexedDB 状态生效并可重复执行；不能覆盖已有档案或已发布的修改版本。
- 档案管理只显示九个纵向左侧分类标签，标签切换过滤右侧列表。

---

### Task 1: 官方基础档案归一化与本地补齐

**Files:**
- Create: `src/archive-workflow/official-archive-baseline.js`
- Modify: `src/archive-workflow/repositories/local-indexeddb-repository.js:16-48`
- Modify: `src/archive-workflow/local/local-admin-runtime.js:50-56`
- Test: `tests/official-archive-baseline.test.mjs`

**Interfaces:**
- Consumes: `ARCHIVE_ROOTS` entries with static station/entrance codes and `ARCHIVE_TEMPLATES` categories.
- Produces: `buildOfficialWorkspaceBaselines(): Archive[]` and `hydrateOfficialWorkspaceBaselines(state): LocalState`.

- [ ] **Step 1: Write the failing baseline test**

```js
const baselines = buildOfficialWorkspaceBaselines();
assert.equal(baselines.filter(({ category }) => category === 'station').length, 20);
assert.equal(baselines.filter(({ category }) => category === 'entrance').length, 18);
assert.ok(baselines.every(({ origin, visibility }) => origin === 'official' && visibility === 'public'));
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/official-archive-baseline.test.mjs`

Expected: FAIL because `official-archive-baseline.js` does not exist.

- [ ] **Step 3: Implement the smallest baseline builder and hydrator**

```js
export const hydrateOfficialWorkspaceBaselines = (state) => ({
  ...state,
  archives: [...state.archives, ...buildOfficialWorkspaceBaselines()
    .filter((baseline) => !state.archives.some((archive) => archive.code === baseline.code))],
});
```

Create only `station` and `entrance` rows; use stable local IDs, public visibility, official origin, a blank summary, template abbreviation, and source metadata in `index_payload`.

- [ ] **Step 4: Add IndexedDB hydration only for local-admin runtime**

```js
const seededState = (state) => hydrateOfficialWorkspaceBaselines(
  normalizeLocalState(state === undefined ? seedState : state),
);
```

Pass `seedOfficialBaselines: true` from `createLocalAdminRuntime`; leave generic repository callers unchanged unless the option is set.

- [ ] **Step 5: Run the focused tests**

Run: `node --test tests/official-archive-baseline.test.mjs tests/archive-workflow-repository-shapes.test.mjs`

Expected: PASS; the static editor-source shape tests remain valid.

- [ ] **Step 6: Commit**

```bash
git add src/archive-workflow/official-archive-baseline.js src/archive-workflow/repositories/local-indexeddb-repository.js src/archive-workflow/local/local-admin-runtime.js tests/official-archive-baseline.test.mjs
git commit -m "feat: hydrate official station and entrance archives"
```

### Task 2: Supabase official baseline migration

**Files:**
- Create: `supabase/migrations/202607300003_seed_station_entrance_official_archives.sql`
- Test: `tests/official-archive-baseline.test.mjs`

**Interfaces:**
- Consumes: the 38 rows from `buildOfficialWorkspaceBaselines()`.
- Produces: public `archives` rows keyed by their static `code`; the existing Supabase repository can discover them through `listEditableArchives`.

- [ ] **Step 1: Extend the failing test with the database seed contract**

```js
assert.match(migration, /'station'/);
assert.match(migration, /'entrance'/);
assert.match(migration, /on conflict \(code\) do nothing/i);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/official-archive-baseline.test.mjs`

Expected: FAIL because the migration is absent.

- [ ] **Step 3: Add the idempotent migration**

```sql
insert into public.archives (id, code, category, title, summary, visibility, origin, published_at)
select gen_random_uuid(), code, category, title, '', 'public', 'official', now()
from official_station_and_entrance_archives
on conflict (code) do nothing;
```

Put all 20 station and 18 entrance source codes into the CTE, preserving their categories and display titles.

- [ ] **Step 4: Run the focused tests**

Run: `node --test tests/official-archive-baseline.test.mjs tests/archive-admin-workflow.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/202607300003_seed_station_entrance_official_archives.sql tests/official-archive-baseline.test.mjs
git commit -m "feat: seed official station and entrance archives"
```

### Task 3: Restrict clerk new actions for codes 03 and 04

**Files:**
- Modify: `src/archive-workflow/workspace.js:2034-2115,2481-2516`
- Test: `tests/clerk-workflow-ui.test.mjs`
- Test: `tests/clerk-native-editor-browser.test.mjs`

**Interfaces:**
- Consumes: active `context.role` and templates `03` / `04`.
- Produces: clerk category action dialogs containing only Modify for these two categories; direct stale new-action calls exit before opening a chooser.

- [ ] **Step 1: Write the failing UI contract test**

```js
assert.match(workspace, /const clerkNewRestrictedTemplateCodes = new Set\(\['03', '04'\]\)/);
assert.match(workspace, /canStartCategoryArchive\(template\)/);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/clerk-workflow-ui.test.mjs`

Expected: FAIL because the role/template guard is absent.

- [ ] **Step 3: Implement one role-aware guard used by all new entry points**

```js
const canStartCategoryArchive = (template) => (
  context.role === 'admin' || !clerkNewRestrictedTemplateCodes.has(template.code)
);
```

Use this guard to omit the category dialog’s new button, reject `openCategoryNewArchiveChooser`, and prevent restricted category entries in the generic new chooser.

- [ ] **Step 4: Run UI unit tests**

Run: `node --test tests/clerk-workflow-ui.test.mjs`

Expected: PASS.

- [ ] **Step 5: Add and run browser proof**

```js
await switchPrincipal(page, clerk);
await openCategoryAction(page, '03', 'modify');
assert.equal(await page.$$eval('[data-category-archive-actions="03"] [data-category-action]', (nodes) => nodes.map((node) => node.dataset.categoryAction)), ['modify']);
```

Assert that the modification picker contains a known station code and the native editor fields are prefilled from the static source; assert an admin sees both actions.

- [ ] **Step 6: Commit**

```bash
git add src/archive-workflow/workspace.js tests/clerk-workflow-ui.test.mjs tests/clerk-native-editor-browser.test.mjs
git commit -m "feat: restrict clerk station and entrance creation"
```

### Task 4: Nine left archive-management category tabs

**Files:**
- Modify: `src/archive-workflow/workspace.js:2698-2855`
- Modify: `src/archive-workflow/workspace.css:1046-1109,1271-1285`
- Test: `tests/archive-admin-workflow.test.mjs`
- Test: `tests/clerk-native-editor-browser.test.mjs`

**Interfaces:**
- Consumes: `ARCHIVE_TEMPLATES` and `client.listAdminArchives({ query })` result rows.
- Produces: `[data-admin-archive-category]` controls for each of nine templates and a filtered `[data-admin-archive-results]` list that retains card action delegation.

- [ ] **Step 1: Write the failing manager test**

```js
assert.match(workspace, /data-admin-archive-category/);
assert.match(workspace, /data-admin-archive-results/);
assert.match(workspace, /archive-admin-category-tabs/);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/archive-admin-workflow.test.mjs`

Expected: FAIL because no category-tab markup exists.

- [ ] **Step 3: Render a left tab rail and a separately scrolling right results pane**

```js
const activeTemplate = ARCHIVE_TEMPLATES.find(({ category }) => category === activeCategory)
  ?? ARCHIVE_TEMPLATES[0];
const visibleArchives = archives.filter(({ category }) => category === activeTemplate.category);
```

Render every template as a button with its count, update `aria-pressed` on click, and place card markup in the results pane so its existing archive actions continue to bubble to the same listener.

- [ ] **Step 4: Add compact retro-window CSS**

```css
.archive-admin-archive-browser { display: grid; grid-template-columns: 118px minmax(0, 1fr); min-height: 0; }
.archive-admin-category-tabs { overflow: auto; }
.archive-admin-archive-results { overflow: auto; }
```

At narrow widths switch only the inner browser to an accessible horizontal tab strip above results.

- [ ] **Step 5: Run UI and browser tests**

Run: `node --test tests/archive-admin-workflow.test.mjs tests/clerk-native-editor-browser.test.mjs`

Expected: PASS; browser test asserts nine tabs and switches from one non-empty category to another.

- [ ] **Step 6: Commit**

```bash
git add src/archive-workflow/workspace.js src/archive-workflow/workspace.css tests/archive-admin-workflow.test.mjs tests/clerk-native-editor-browser.test.mjs
git commit -m "feat: organize archive manager by category tabs"
```

### Task 5: Full verification and delivery review

**Files:**
- Test: `tests/official-archive-baseline.test.mjs`
- Test: `tests/clerk-native-editor-browser.test.mjs`

- [ ] **Step 1: Run all affected unit contracts**

Run: `node --test tests/official-archive-baseline.test.mjs tests/archive-workflow-repository-shapes.test.mjs tests/clerk-workflow-ui.test.mjs tests/archive-admin-workflow.test.mjs`

Expected: PASS with no warning or skipped assertion.

- [ ] **Step 2: Run browser validation**

Run: `node --test tests/clerk-native-editor-browser.test.mjs`

Expected: PASS; the local admin flow hydrates the 38 source records, a clerk can modify but not create 03/04, and the archive manager filter is usable.

- [ ] **Step 3: Run build and whitespace validation**

Run: `npm run build; git diff --check`

Expected: both commands exit 0.

- [ ] **Step 4: Review requirement coverage**

Confirm the plan’s Task 1/2 meet the existing-data visibility requirement, Task 3 meets the role rule, and Task 4 meets the nine left-tab rule. No task changes the user’s current review/publication workflow.

- [ ] **Step 5: Commit any verification-only adjustment**

```bash
git add <only-files-fixed-by-verification>
git commit -m "test: verify station and entrance workspace access"
```
