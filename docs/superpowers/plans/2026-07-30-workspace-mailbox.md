# 工作台邮筒与审核提醒 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 PALIS 书记官与管理员工作台中加入一个联动审核状态的邮筒入口。

**Architecture:** 复用已有 `archive_notifications`、`listNotifications`、`markNotificationRead` 和 `listReviewQueue` 数据接口。桌面新增一个带状态徽记的邮筒快捷方式；命令根据当前角色打开既有审核回信或审核录入窗口，避免创建并行消息系统。

**Tech Stack:** Vite、原生 ES 模块、HTML、CSS、Node 原生测试、Supabase/IndexedDB 档案工作流接口。

## Global Constraints

- 复用 `public/assets/icons/archive-inbox.svg`，不引入第三方运行时依赖。
- 书记官展示管理员实际批复的通知 `message`、档案标题和创建时间。
- 管理员提醒以既有 `listReviewQueue()` 的待办数量为准。
- 未读状态只在书记官打开邮筒并成功标记通知已读后清除。
- 保持既有 Win95/PALIS 桌面视觉；仅增加邮筒快捷方式与红色感叹号徽记。

---

### Task 1: 邮筒快捷方式与视觉状态

**Files:**
- Modify: `index.html:281-294`
- Modify: `src/style.css:9253-9419`
- Test: `tests/clerk-workspace.test.mjs`

**Interfaces:**
- Consumes: `data-workspace-command`, `data-admin-only`, `/assets/icons/archive-inbox.svg`。
- Produces: `data-workspace-command="mailbox"` 与 `data-workspace-mailbox-alert`，供工作台状态同步使用。

- [ ] **Step 1: Write the failing test**

```js
assert.match(desktopIcons, /data-workspace-command="mailbox"/);
assert.match(desktopIcons, /\/assets\/icons\/archive-inbox\.svg/);
assert.match(desktopIcons, /data-workspace-mailbox-alert/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/clerk-workspace.test.mjs`

Expected: FAIL because the desktop has no `mailbox` command or alert marker.

- [ ] **Step 3: Add the desktop shortcut and badge styling**

```html
<button type="button" data-clerk-desktop-entry data-workspace-shortcut
  data-workspace-command="mailbox" aria-label="邮筒，暂无新消息">
  <i class="clerk-desktop__icon clerk-desktop__icon--mailbox" aria-hidden="true">
    <img src="/assets/icons/archive-inbox.svg" alt="" />
    <b data-workspace-mailbox-alert hidden>!</b>
  </i>
  <span>邮筒</span>
</button>
```

```css
#clerk-desktop .clerk-desktop__icon--mailbox [data-workspace-mailbox-alert] {
  position: absolute;
  right: -6px;
  top: -6px;
  display: grid;
  width: 20px;
  height: 20px;
  place-items: center;
  color: #fff;
  border: 1px solid #fff;
  background: #c62828;
  font: 800 14px/1 var(--font-mono);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/clerk-workspace.test.mjs`

Expected: PASS.

### Task 2: 角色感知的未读状态与邮筒命令

**Files:**
- Modify: `src/archive-workflow/workspace.js:504-512, 3226-3250`
- Test: `tests/clerk-workflow-ui.test.mjs`

**Interfaces:**
- Consumes: `client.listNotifications(recipientId)`, `client.listReviewQueue()`, `context.profile.id`, `context.role`。
- Produces: `refreshMailboxAlert()` and `mailbox` command handling.

- [ ] **Step 1: Write the failing test**

```js
assert.match(workspace, /const refreshMailboxAlert = async \(\) =>/);
assert.match(workspace, /client\.listNotifications\(context\.profile\.id\)/);
assert.match(workspace, /client\.listReviewQueue\(\)/);
assert.match(workspace, /command === 'mailbox'/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/clerk-workflow-ui.test.mjs`

Expected: FAIL because no mailbox status refresh or command exists.

- [ ] **Step 3: Implement state refresh and routing**

```js
const refreshMailboxAlert = async () => {
  const alert = root.querySelector('[data-workspace-mailbox-alert]');
  const mailbox = root.querySelector('[data-workspace-command="mailbox"]');
  if (!alert || !mailbox || !client || !context.profile?.id) return;
  const pending = canReview(context.role)
    ? await client.listReviewQueue()
    : await client.listNotifications(context.profile.id);
  const hasAlert = canReview(context.role)
    ? pending.length > 0
    : pending.some((notification) => !notification.read_at);
  alert.hidden = !hasAlert;
  mailbox.setAttribute('aria-label', hasAlert ? '邮筒，有新消息' : '邮筒，暂无新消息');
};
```

Call it after `commitSession`, after successful clerk submission, and after the `mailbox` window closes. Route `mailbox` to `openReviewPanel()` for administrators and `openInboxPanel()` for clerks.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/clerk-workflow-ui.test.mjs`

Expected: PASS.

### Task 3: 书记官批复阅读、已读回写与提交确认

**Files:**
- Modify: `src/archive-workflow/workspace.js:1844-1851, 2524-2553`
- Test: `tests/archive-admin-workflow.test.mjs`
- Test: `tests/local-workflow-engine.test.mjs`

**Interfaces:**
- Consumes: `client.listNotifications(profileId)`, `client.markNotificationRead(notificationId, profileId)`。
- Produces: 邮筒中管理员批复的实际正文、档案标题与时间；提交后的“已投递至邮筒 / 等待审核”状态。

- [ ] **Step 1: Write the failing tests**

```js
assert.match(workspace, /已投递至邮筒\s*\/\s*等待审核/);
assert.match(workspace, /Promise\.all\(unread\.map\(\(notification\) =>\s*client\.markNotificationRead/);
assert.match(workspace, /notification\.message/);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/archive-admin-workflow.test.mjs tests/local-workflow-engine.test.mjs`

Expected: FAIL because submission confirmation and inbox reading do not update the mailbox alert lifecycle.

- [ ] **Step 3: Implement receipt confirmation and read lifecycle**

```js
message.textContent = `已投递至邮筒 / 等待审核 / ${submissionId}。批复会寄回“审核回信”。`;

const unread = notifications.filter((notification) => !notification.read_at);
await Promise.all(unread.map((notification) =>
  client.markNotificationRead(notification.id, context.profile.id),
));
await refreshMailboxAlert();
```

Keep the existing notification article rendering so `notification.message` is shown unchanged with its title and timestamp. If loading or marking fails, retain the visible messages and leave the badge state unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/archive-admin-workflow.test.mjs tests/local-workflow-engine.test.mjs`

Expected: PASS.

### Task 4: Regression verification

**Files:**
- Test: `tests/clerk-workspace.test.mjs`
- Test: `tests/clerk-workflow-ui.test.mjs`
- Test: `tests/archive-admin-workflow.test.mjs`
- Test: `tests/local-workflow-engine.test.mjs`

- [ ] **Step 1: Run focused workflow suite**

Run: `node --test tests/clerk-workspace.test.mjs tests/clerk-workflow-ui.test.mjs tests/archive-admin-workflow.test.mjs tests/local-workflow-engine.test.mjs`

Expected: PASS with no failures.

- [ ] **Step 2: Build production bundle and check patch whitespace**

Run: `npm.cmd run build; git diff --check`

Expected: Vite build exits 0 and `git diff --check` exits 0. Existing bundle-size warnings may remain.
