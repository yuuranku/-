# 私人云端草稿 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让云端草稿仅对其所有者可见，并让所有者能确认后删除云端与本地草稿。

**Architecture:** 保持现有 `owner_id` 查询和审核队列分离，在仓库契约中增加受所有者约束的删除接口。书记官工作台的草稿卡片提供继续编辑和删除；删除后刷新列表并清除对应本地自动保存。

**Tech Stack:** Vanilla JavaScript、Supabase、Node test runner。

## Global Constraints

- 草稿列表和删除均以当前登录账号的 `owner_id` 为唯一权限边界。
- 已提交记录、审核队列和正式档案的权限及行为不变。
- 删除前必须确认；关闭窗口不删除草稿。
- 不引入新依赖，保持原有复古窗口 UI。

---

### Task 1: 定义并实现受限草稿删除

**Files:**
- Modify: `src/archive-workflow/repository-contract.js`
- Modify: `src/archive-workflow/repositories/supabase-repository.js`
- Modify: `src/archive-workflow/local/local-workflow-engine.js`
- Test: `tests/archive-workflow-repository-contract.test.mjs`
- Test: `tests/local-workflow-engine.test.mjs`

**Interfaces:**
- Produces: `deleteDraft(draftId, ownerId): Promise<draftId>`，仅删除 `draft` 或 `changes_requested` 状态且 owner 匹配的草稿。

- [ ] **Step 1: Write the failing tests**

```js
await assert.rejects(() => engine.deleteDraft(draftId, otherClerkId));
await engine.deleteDraft(draftId, clerkId);
assert.equal((await engine.listMyDrafts(clerkId)).length, 0);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm.cmd test -- tests/local-workflow-engine.test.mjs tests/archive-workflow-repository-contract.test.mjs`

- [ ] **Step 3: Implement the minimal interface**

```js
const deleteDraft = async (draftId, ownerId) => {
  const draft = requireDraftOwnedBy(draftId, ownerId);
  assertDeletableStatus(draft.status);
  removeDraftAndPersist(draft.id);
  return draft.id;
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm.cmd test -- tests/local-workflow-engine.test.mjs tests/archive-workflow-repository-contract.test.mjs`

### Task 2: 在草稿卡片中加入删除与本地清理

**Files:**
- Modify: `src/archive-workflow/workspace.js`
- Modify: `src/style.css`
- Test: `tests/archive-workflow-browser.test.mjs`

**Interfaces:**
- Consumes: `client.deleteDraft(draftId, currentProfileId)`。
- Produces: 草稿卡片的继续编辑、删除确认、删除后重新加载，以及本地 autosave key 清理。

- [ ] **Step 1: Write the failing browser test**

```js
await page.getByRole('button', { name: '删除草稿' }).click();
await page.getByRole('button', { name: '确认删除' }).click();
await expect(page.getByText('未提交记录')).toHaveCount(0);
```

- [ ] **Step 2: Run the browser test to verify it fails**

Run: `npm.cmd test -- tests/archive-workflow-browser.test.mjs`

- [ ] **Step 3: Implement the minimal UI**

```js
if (window.confirm('删除后无法恢复，是否删除这份云端草稿？')) {
  await client.deleteDraft(draftId, context.profile.id);
  localStorage.removeItem(localDraftKey(context.profile.id, draft));
  await refreshDraftList();
}
```

- [ ] **Step 4: Run the browser test to verify it passes**

Run: `npm.cmd test -- tests/archive-workflow-browser.test.mjs`

### Task 3: 全量验证与提交

**Files:**
- Verify only: source files and tests above

- [ ] **Step 1: Run full verification**

Run: `npm.cmd test; npm.cmd run build`

- [ ] **Step 2: Commit only source, tests, and plan**

```bash
git add src/archive-workflow/repository-contract.js src/archive-workflow/repositories/supabase-repository.js src/archive-workflow/local/local-workflow-engine.js src/archive-workflow/workspace.js src/style.css tests/archive-workflow-repository-contract.test.mjs tests/local-workflow-engine.test.mjs tests/archive-workflow-browser.test.mjs docs/superpowers/plans/2026-07-30-private-cloud-drafts.md
git commit -m "feat: keep cloud drafts private and removable"
```
