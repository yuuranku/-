# 工作台邮箱 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为管理员提供向指定书记官发送正式系统公告的邮箱，并保留自动审核回信。

**Architecture:** `archive_notifications` 继续作为唯一邮件表。数据库函数负责管理员发送与目标书记官校验；Supabase 与本地仓储提供同名方法；工作台在既有邮箱窗口内按角色显示收件箱和发信表单。

**Tech Stack:** Vanilla JavaScript、Supabase/Postgres、Node test runner、现有 Windows 桌面 UI。

## Global Constraints

- 审核回复继续自动投递给原投稿书记官。
- 只有管理员能发送，且仅能发送给启用的书记官。
- 复用既有邮箱窗口与视觉样式。

---

### Task 1: 通知发送边界

**Files:**
- Modify: `tests/local-workflow-engine.test.mjs`
- Modify: `src/archive-workflow/local/local-workflow-engine.js`
- Modify: `src/archive-workflow/repository-contract.js`

- [ ] **Step 1: Write the failing test**

```js
test('admin announcements reach only the addressed clerk', async () => {
  const sent = await harness.repository.sendAnnouncement('clerk-1', {
    subject: '值班变更', message: '今晚改用 B 班表。',
  });
  assert.equal(sent.kind, 'announcement');
  assert.equal((await harness.repository.listNotifications('clerk-1')).length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/local-workflow-engine.test.mjs`

- [ ] **Step 3: Implement the minimal repository contract and local method**

Add `sendAnnouncement(recipientId, { subject, message })`; require an admin principal, an enabled clerk recipient, and non-empty bounded text. Append an `announcement` notification with no contribution.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/local-workflow-engine.test.mjs`

### Task 2: 云端公告投递

**Files:**
- Create: `supabase/migrations/202607300010_workspace_mailbox.sql`
- Modify: `src/archive-workflow/repositories/supabase-repository.js`

- [ ] **Step 1: Add a failing contract expectation**

Add `sendAnnouncement` to the required repository method list so current repository tests fail until both implementations expose it.

- [ ] **Step 2: Run the repository tests to verify failure**

Run: `node --test tests/archive-workflow-repository-contract.test.mjs tests/archive-workflow-repository-shapes.test.mjs`

- [ ] **Step 3: Add the database RPC and Supabase method**

Migration drops the old notification-kind constraint, allows `announcement`, and creates `send_workspace_announcement(uuid,text,text)` as a security-definer admin-only function that validates an enabled clerk recipient and inserts the notification. The repository calls that RPC after client-side validation.

- [ ] **Step 4: Run repository tests**

Run: `node --test tests/archive-workflow-repository-contract.test.mjs tests/archive-workflow-repository-shapes.test.mjs`

### Task 3: 邮箱界面

**Files:**
- Modify: `index.html`
- Modify: `src/archive-workflow/workspace.js`
- Modify: `tests/clerk-workflow-ui.test.mjs`

- [ ] **Step 1: Write a failing UI contract test**

Assert that the mailbox is labeled as a formal mailbox, has an administrator-only recipient/subject/message form, and renders `announcement` with the fixed sender `PALIS 档案管理处` without requiring a contribution title or exposing an administrator email.

- [ ] **Step 2: Run the UI test to verify failure**

Run: `node --test tests/clerk-workflow-ui.test.mjs`

- [ ] **Step 3: Implement the minimal mailbox UI**

Use the inbox window for all roles. Rename the ornament and window to 邮箱; load current user notifications; administrators additionally load users and send only to clerk recipients. Preserve mark-read behavior and refresh the red alert after sends.

- [ ] **Step 4: Run the UI test**

Run: `node --test tests/clerk-workflow-ui.test.mjs`

### Task 4: Verify and publish

- [ ] Run `npm.cmd test` and `npm.cmd run build`.
- [ ] Apply `supabase db push` with the existing linked project.
- [ ] Deploy with `npx.cmd wrangler deploy` and verify the production site returns HTTP 200.
