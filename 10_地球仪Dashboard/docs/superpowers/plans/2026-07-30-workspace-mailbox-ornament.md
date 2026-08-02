# 工作台邮筒摆件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用可拖动的顶层邮箱摆件替换工作台的邮筒桌面快捷方式，同时保留真实审核与回信提醒。

**Architecture:** 在 `#clerk-desktop` 内新增一个独立覆盖层按钮，复用既有工作台命令和通知读取接口。摆件位置只保存在当前会话的 CSS 变量中，避免向档案数据或用户资料写入无关数据。

**Tech Stack:** 原生 HTML、CSS、JavaScript、Node test、Vite。

## Global Constraints

- 仅使用本地 `archive-inbox.svg`，不得新增网络素材或运行时图标请求。
- 加载页与公开档案页不显示摆件。
- 保持现有 Win95 / PALIS 桌面风格；不改动原有吉祥物。
- 提醒继续来自 `listNotifications`、`markNotificationRead` 与 `listReviewQueue`。

---

### Task 1: 摆件结构和样式

**Files:**
- Modify: `index.html:291-315`
- Modify: `src/style.css:9390-9440`
- Test: `tests/clerk-workspace.test.mjs`

**Interfaces:**
- Consumes: `data-workspace-command="mailbox"` 命令分发器。
- Produces: `data-workspace-mailbox-ornament` 和 `data-workspace-mailbox-alert` DOM 节点。

- [ ] **Step 1: Write the failing test**

```js
assert.match(html, /data-workspace-mailbox-ornament/);
assert.doesNotMatch(desktopIcons, /data-workspace-command="mailbox"/);
assert.match(styles, /\.workspace-mailbox-ornament/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/clerk-workspace.test.mjs`

Expected: FAIL because the current mailbox remains a desktop shortcut.

- [ ] **Step 3: Write minimal implementation**

```html
<button data-workspace-mailbox-ornament data-workspace-command="mailbox">
  <img src="/assets/icons/archive-inbox.svg" alt="" />
  <b data-workspace-mailbox-alert hidden>!</b>
</button>
```

```css
#clerk-desktop [data-workspace-mailbox-ornament] {
  position: absolute;
  z-index: 30;
  touch-action: none;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/clerk-workspace.test.mjs`

Expected: mailbox-structure assertion passes; unrelated existing failures remain documented.

### Task 2: 拖拽、顶层和命令联动

**Files:**
- Modify: `src/archive-workflow/workspace.js:500-570,3260-3330`
- Test: `tests/clerk-workflow-ui.test.mjs`

**Interfaces:**
- Consumes: `data-workspace-mailbox-ornament`, `palis:workspace-command`, `refreshMailboxAlert()`。
- Produces: `initializeMailboxOrnament()`，仅改变摆件的 `--mailbox-ornament-x/y` 会话变量。

- [ ] **Step 1: Write the failing test**

```js
assert.match(workspace, /const initializeMailboxOrnament = \(\) =>/);
assert.match(workspace, /setPointerCapture/);
assert.match(workspace, /--mailbox-ornament-x/);
assert.match(workspace, /data-workspace-command="mailbox"/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/clerk-workflow-ui.test.mjs`

Expected: FAIL because no drag initializer exists.

- [ ] **Step 3: Write minimal implementation**

```js
const initializeMailboxOrnament = () => {
  mailboxOrnament.addEventListener('pointerdown', (event) => {
    mailboxOrnament.setPointerCapture(event.pointerId);
    // Clamp the translated position to the clerk desktop viewport on pointermove.
  });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/clerk-workflow-ui.test.mjs`

Expected: PASS with the existing notification data-source assertions.

### Task 3: 回归验证

**Files:**
- Test: `tests/clerk-workspace.test.mjs`
- Test: `tests/clerk-workflow-ui.test.mjs`

- [ ] **Step 1: Check the focused diff**

Run: `git diff --check -- index.html src/style.css src/archive-workflow/workspace.js tests/clerk-workspace.test.mjs tests/clerk-workflow-ui.test.mjs`

Expected: exit 0.

- [ ] **Step 2: Run focused tests**

Run: `node --test tests/clerk-workflow-ui.test.mjs`

Expected: PASS.

- [ ] **Step 3: Build production bundle**

Run: `npm.cmd run build`

Expected: Vite build exits 0.
