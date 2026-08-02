# PALIS Win95 Workspace Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the internal clerk/administrator launcher with a coherent Win95 desktop, Start menu, taskbar, PALIS archive cabinet, and classic window behavior while leaving the public PALIS archive museum unchanged.

**Architecture:** Keep the existing workspace overlay and window maps. Move the nine category launchers into a focused archive-cabinet module, route desktop and Start-menu commands through one custom-event contract, and add maximize/exit protection to the two existing window managers without merging them. The public archive surface remains outside this shell.

**Tech Stack:** Vanilla HTML, CSS, JavaScript ES modules, Node test runner, Puppeteer Core, Vite.

## Global Constraints

- The outer PALIS home page, nine public directories, formal archive details, art layout, and motion must not change.
- Win95 owns the desktop, Start menu, taskbar, system tray, and application chrome; PALIS owns archive content inside application windows.
- The nine category entries must live inside `PALIS 档案柜`, not directly on the desktop.
- Clerk desktops show `PALIS 档案柜`, `暂存箱`, `审核回信`, and `PALIS 助手`; administrator desktops additionally show `审核与录入`, `档案管理`, and `账号管理`.
- Station and entrance remain amendment-only for clerks and fully manageable by administrators.
- The taskbar contains only Start, open tasks, tray state, and clock.
- Escape closes the Start menu or clears desktop selection; it never exits the workspace.
- At widths of 760px or less, windows are maximized, dragging is disabled, and controls retain at least a 44px touch target.
- No database migration, public archive projection, archive numbering rule, or Supabase request is changed.
- All icons remain local assets; no runtime icon service or new UI dependency is added.

## File Responsibility Map

- `index.html`: semantic desktop shortcuts, Start menu, taskbar tray, and native exit-confirmation dialog.
- `public/assets/icons/archive-{cabinet,management,assistant}.svg`: distinct local Win95 application icons.
- `src/main.js`: desktop/open state, Start-menu controller, desktop activation rules, safe exit, assistant-window maximize state.
- `src/auth.js`: await the dirty-workspace guard before preview exit or cloud sign-out.
- `src/style.css`: desktop wallpaper, icons, Start menu, taskbar, tray, generic classic windows, responsive shell.
- `src/archive-workflow/archive-cabinet.js`: category permission view-model and archive-cabinet markup.
- `src/archive-workflow/autosave.js`: exact queued-generation detail for safe dirty-state clearing.
- `src/archive-workflow/workspace.js`: workspace command routing, archive-cabinet window, workflow-window maximize/task behavior.
- `src/archive-workflow/workspace.css`: workflow-window chrome and archive-cabinet client area.
- `tests/archive-cabinet.test.mjs`: pure category/role contract.
- `tests/archive-autosave.test.mjs`: queued-generation regression coverage.
- `tests/clerk-workspace.test.mjs`: shell markup and source-level regression checks.
- `tests/clerk-workflow-ui.test.mjs`: nine-category reachability and role-gating regression checks.
- `tests/workspace-ux-regression.test.mjs`: window/taskbar/focus/responsive CSS contracts.
- `tests/local-admin-runtime-browser.test.mjs`: real local-admin Start, cabinet, window, and taskbar behavior.
- `scripts/compare-palis-baseline.mjs`: public-only comparison mode that still validates the complete capture manifest.

---

### Task 1: Replace launcher markup with a semantic Win95 desktop shell

Tasks 1–4 are one atomic migration batch. Do not commit or hand off the
intermediate DOM state: the old launcher disappears in Task 1, its controller
is replaced in Task 2, the cabinet destination arrives in Task 3, and safe
exit/window coordination arrives in Task 4.

**Files:**

- Modify: `index.html:278-363`
- Create: `public/assets/icons/archive-cabinet.svg`
- Create: `public/assets/icons/archive-management.svg`
- Create: `public/assets/icons/archive-assistant.svg`
- Modify: `tests/clerk-workspace.test.mjs:43-63`
- Modify: `tests/clerk-workflow-ui.test.mjs:12-31`

**Interfaces:**

- Consumes: existing IDs `#clerk-desktop`, `#assistant-window-layer`, `#assistant-task-list`, and `#clerk-desktop-time`.
- Produces: `#clerk-desktop-start-menu`, `[data-workspace-shortcut]`, `[data-workspace-command]`, `.clerk-desktop__tray`, and `#workspace-exit-dialog`.

- [ ] **Step 1: Write failing shell-structure tests**

Replace the direct-nine-shortcut assertion in `tests/clerk-workspace.test.mjs` with:

```js
test('the clerk desktop exposes system shortcuts and keeps nine archives in the cabinet', () => {
  const desktopStart = html.indexOf('<section class="clerk-desktop"');
  const desktopEnd = html.indexOf('<section class="version-notice"', desktopStart);
  const desktopMarkup = html.slice(
    desktopStart,
    desktopEnd,
  );

  for (const command of ['cabinet', 'drafts', 'inbox', 'assistant']) {
    assert.match(desktopMarkup, new RegExp(`data-workspace-command="${command}"`));
  }
  assert.match(desktopMarkup, /id="clerk-desktop-start-menu"/);
  assert.match(desktopMarkup, /class="clerk-desktop__tray"/);
  assert.match(desktopMarkup, /id="workspace-exit-dialog"/);
  assert.match(desktopMarkup, /id="workspace-sync-dialog"/);
  assert.match(desktopMarkup, /data-workspace-watermark-connection/);
  for (const icon of [
    'archive-cabinet.svg',
    'archive-management.svg',
    'archive-assistant.svg',
  ]) assert.match(desktopMarkup, new RegExp(icon.replace('.', '\\.')));
  assert.doesNotMatch(desktopMarkup, /data-archive-template="\d{2}"/);
  assert.doesNotMatch(desktopMarkup, /class="clerk-desktop__utilities"/);
});
```

Update the first test in `tests/clerk-workflow-ui.test.mjs` so category availability comes from `templates.js`, not desktop HTML:

```js
test('all nine archive templates remain registered for the PALIS cabinet', async () => {
  assert.equal((templates.match(/template\('\d{2}'/g) || []).length, 9);
  for (const file of [
    '01-国家档案设定卡.html',
    '02-组织档案设定卡.html',
    '03-科考站档案设定卡.html',
    '04-白幕入口档案设定卡.html',
    '05-生态档案设定卡.html',
    '06-人物档案设定卡.html',
    '07-事件档案设定卡.html',
    '08-异常附卷设定卡.html',
    '09-物种与标本档案设定卡.html',
  ]) await access(new URL(`public/templates/${file}`, projectRoot));
});
```

- [ ] **Step 2: Run the tests and verify the old launcher fails**

Run:

```powershell
node --test tests/clerk-workspace.test.mjs tests/clerk-workflow-ui.test.mjs
```

Expected: FAIL because the nine template buttons are still on the desktop and the Start menu/tray/dialog markup does not exist.

- [ ] **Step 3: Replace the desktop and taskbar markup**

Use this structure in `index.html`, retaining only the existing welcome window
and window layer. Remove the visible identity masthead, nine direct template
icons, utility cards, old exit button, and overloaded taskbar:

```html
<header class="clerk-desktop__accessible-title">
  <h2 id="clerk-desktop-title" data-workspace-name>书记官工作台</h2>
  <span data-workspace-name-en>CLERK WORKSPACE</span>
  <span data-workspace-greeting>欢迎进入 PALIS 工作台</span>
</header>

<div class="clerk-desktop__watermark" aria-hidden="true">
  <b>PALIS LOCAL 09A</b>
  <span data-workspace-watermark-role>CLERK</span>
  <span data-workspace-watermark-connection>LOCAL</span>
</div>

<nav class="clerk-desktop__icons" aria-label="工作台桌面快捷方式">
  <button type="button" data-clerk-desktop-entry data-workspace-shortcut data-workspace-command="cabinet">
    <i class="clerk-desktop__icon" data-icon-type="cabinet" aria-hidden="true"><img src="/assets/icons/archive-cabinet.svg" alt="" /></i>
    <span>PALIS 档案柜</span>
  </button>
  <button type="button" data-clerk-desktop-entry data-workspace-shortcut data-workspace-command="drafts">
    <i class="clerk-desktop__icon" data-icon-type="drafts" aria-hidden="true"><img src="/assets/icons/archive-draft.svg" alt="" /></i>
    <span>暂存箱</span>
  </button>
  <button type="button" data-clerk-desktop-entry data-workspace-shortcut data-workspace-command="inbox">
    <i class="clerk-desktop__icon" data-icon-type="inbox" aria-hidden="true"><img src="/assets/icons/archive-inbox.svg" alt="" /></i>
    <span>审核回信</span>
  </button>
  <button type="button" data-clerk-desktop-entry data-workspace-shortcut data-workspace-command="assistant">
    <i class="clerk-desktop__icon" data-icon-type="assistant" aria-hidden="true"><img src="/assets/icons/archive-assistant.svg" alt="" /></i>
    <span>PALIS 助手</span>
  </button>
  <button type="button" data-clerk-desktop-entry data-workspace-shortcut data-workspace-command="review" data-admin-only hidden>
    <i class="clerk-desktop__icon" data-icon-type="review" aria-hidden="true"><img src="/assets/icons/archive-review.svg" alt="" /></i>
    <span>审核与录入</span>
  </button>
  <button type="button" data-clerk-desktop-entry data-workspace-shortcut data-workspace-command="archives" data-admin-only hidden>
    <i class="clerk-desktop__icon" data-icon-type="archives" aria-hidden="true"><img src="/assets/icons/archive-management.svg" alt="" /></i>
    <span>档案管理</span>
  </button>
  <button type="button" data-clerk-desktop-entry data-workspace-shortcut data-workspace-command="users" data-admin-only hidden>
    <i class="clerk-desktop__icon" data-icon-type="users" aria-hidden="true"><img src="/assets/icons/archive-users.svg" alt="" /></i>
    <span>账号管理</span>
  </button>
</nav>

<nav class="clerk-desktop__start-menu" id="clerk-desktop-start-menu" aria-label="开始菜单" hidden>
  <b class="clerk-desktop__start-brand" aria-hidden="true">PALIS 09A</b>
  <div class="clerk-desktop__start-items">
    <button type="button" data-workspace-command="cabinet">PALIS 档案柜</button>
    <button type="button" data-workspace-command="drafts">暂存箱</button>
    <button type="button" data-workspace-command="inbox">审核回信</button>
    <div data-admin-only hidden>
      <p>管理工具</p>
      <button type="button" data-workspace-command="review">审核与录入</button>
      <button type="button" data-workspace-command="archives">档案管理</button>
      <button type="button" data-workspace-command="users">账号管理</button>
    </div>
    <button type="button" data-workspace-command="assistant">PALIS 助手</button>
    <button type="button" data-workspace-command="about">关于此工作台</button>
    <hr />
    <button type="button" data-workspace-command="exit">返回档案系统</button>
  </div>
</nav>

<footer class="clerk-desktop__taskbar" id="assistant-taskbar">
  <button class="clerk-desktop__start" id="clerk-desktop-start" type="button"
    aria-controls="clerk-desktop-start-menu" aria-expanded="false"><i aria-hidden="true"></i><b>开始</b></button>
  <div class="clerk-desktop__task-list" id="assistant-task-list" hidden></div>
  <div class="clerk-desktop__tray" aria-label="系统托盘">
    <button type="button" data-workspace-tray="sync" aria-label="查看本地与云端保存状态"><i></i></button>
    <span data-workspace-tray-role aria-label="当前身份">书记官</span>
    <span data-workspace-connection aria-label="保存连接状态">LOCAL</span>
    <time id="clerk-desktop-time">13:13</time>
  </div>
</footer>

<dialog class="workspace-exit-dialog" id="workspace-exit-dialog" aria-labelledby="workspace-exit-title">
  <form method="dialog">
    <h2 id="workspace-exit-title">仍有未同步的档案内容</h2>
    <p data-workspace-exit-message>请选择如何处理当前工作。</p>
    <div>
      <button type="button" value="cancel" data-workspace-exit-action="cancel">继续编辑</button>
      <button type="button" value="save" data-workspace-exit-action="save">保存到本地后返回</button>
      <button type="button" value="discard" data-workspace-exit-action="discard">放弃未同步修改</button>
    </div>
  </form>
</dialog>

<dialog class="workspace-sync-dialog" id="workspace-sync-dialog"
  aria-labelledby="workspace-sync-title">
  <form method="dialog">
    <h2 id="workspace-sync-title">PALIS 保存状态</h2>
    <p data-workspace-sync-summary>当前没有打开的档案编辑器。</p>
    <button value="close">确定</button>
  </form>
</dialog>
```

Create three distinct, local-only 32px application icons. Keep their exact
paths stable because desktop shortcuts, title bars, and task buttons reuse
them:

`public/assets/icons/archive-cabinet.svg`

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <path fill="#c0c0c0" stroke="#000" stroke-width="2" d="M4 3h24v26H4z"/>
  <path fill="#000080" d="M6 5h20v5H6z"/>
  <path fill="#fff" stroke="#000" d="M7 13h18v5H7zm0 8h18v5H7z"/>
  <path stroke="#000" d="M14 15h4m-4 8h4"/>
</svg>
```

`public/assets/icons/archive-management.svg`

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <path fill="#fff" stroke="#000" stroke-width="2" d="M5 3h17l5 5v21H5z"/>
  <path fill="#c0c0c0" stroke="#000" d="M22 3v6h5"/>
  <path fill="#000080" d="M8 12h16v3H8zm0 6h11v3H8zm0 6h8v3H8z"/>
  <path fill="#ffd23f" stroke="#000" d="m23 18 2 2 3-1 1 3-2 2 1 3-3 1-2 2-2-2-3 1-1-3 2-2-1-3 3-1z"/>
</svg>
```

`public/assets/icons/archive-assistant.svg`

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <path fill="#fff" stroke="#000" stroke-width="2" d="M3 4h26v20H14l-6 5v-5H3z"/>
  <path fill="#000080" d="M6 7h20v4H6z"/>
  <circle cx="11" cy="16" r="2" fill="#000"/>
  <circle cx="21" cy="16" r="2" fill="#000"/>
  <path fill="none" stroke="#000" stroke-width="2" d="M11 20c3 3 7 3 10 0"/>
</svg>
```

- [ ] **Step 4: Run shell-structure tests**

Run:

```powershell
node --test tests/clerk-workspace.test.mjs tests/clerk-workflow-ui.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Keep the semantic shell in the atomic migration batch**

Do not commit yet. Continue directly to Task 2; the runtime browser test and
one atomic commit occur at the end of Task 4.

---

### Task 2: Make Start and desktop shortcuts behave like one operating system

**Files:**

- Modify: `src/main.js:130-240`
- Modify: `src/main.js:581-642`
- Modify: `src/archive-workflow/workspace.js:422-470`
- Modify: `src/archive-workflow/workspace.js:2340-2390`
- Modify: `tests/local-admin-runtime-browser.test.mjs:45-85`
- Modify: `tests/clerk-workspace.test.mjs`

**Interfaces:**

- Consumes: `[data-workspace-command]` from Task 1.
- Produces: window event `palis:workspace-command` with detail `{ command: string }`.
- Produces: window event `palis:workspace-exit-request` with no required detail.
- Produces: `setDesktopStartMenuOpen(open: boolean): void` inside `initializeMascotAssistant()`.

- [ ] **Step 1: Add failing browser assertions for Start and Escape**

Insert after the local administrator opens the desktop:

```js
await page.click('#clerk-desktop-start');
await page.waitForSelector('#clerk-desktop-start-menu:not([hidden])');
assert.equal(
  await page.$eval('#clerk-desktop-start', (button) => button.getAttribute('aria-expanded')),
  'true',
);
await page.keyboard.press('Escape');
assert.equal(await page.$eval('#clerk-desktop-start-menu', (menu) => menu.hidden), true);
assert.equal(await page.$eval('#clerk-desktop', (desktop) => desktop.hidden), false);
```

Add source assertions:

```js
test('workspace commands use one Start-menu and desktop dispatch contract', () => {
  assert.match(script, /palis:workspace-command/);
  assert.match(script, /setDesktopStartMenuOpen/);
  assert.doesNotMatch(script, /desktopStart\.addEventListener\('click', \(\) => \{\s*desktopWelcome\.hidden = false/s);
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```powershell
node --test tests/clerk-workspace.test.mjs tests/local-admin-runtime-browser.test.mjs
```

Expected: FAIL because Start still opens the welcome window and Escape still closes the workspace.

- [ ] **Step 3: Implement a single command and Start-menu controller**

First remove the obsolete `desktopExit` query, remove it from the
`initializeMascotAssistant()` required-node guard, delete
`desktopExit.addEventListener(...)`, and delete the old
`desktopEntries.forEach(...)` launcher block. The new
`[data-workspace-command]` controller below is the only desktop command path.

Inside `initializeMascotAssistant()`:

```js
const desktopStartMenu = document.querySelector('#clerk-desktop-start-menu');
const desktopCommands = [...desktop.querySelectorAll('[data-workspace-command]')];
let selectedDesktopShortcut = null;

function setDesktopStartMenuOpen(open) {
  desktopStartMenu.hidden = !open;
  desktopStart.setAttribute('aria-expanded', String(open));
  if (open) desktopStartMenu.querySelector('button:not([hidden])')?.focus({ preventScroll: true });
}

function dispatchWorkspaceCommand(command, trigger) {
  const fromStartMenu = Boolean(
    trigger?.closest?.('#clerk-desktop-start-menu'),
  );
  setDesktopStartMenuOpen(false);
  if (fromStartMenu) desktopStart.focus({ preventScroll: true });
  else trigger?.focus?.({ preventScroll: true });
  if (command === 'about') {
    desktopWelcome.hidden = false;
    desktopWelcome.focus({ preventScroll: true });
    return;
  }
  if (command === 'assistant') {
    const assistantEntry = desktop.querySelector(
      '[data-workspace-shortcut][data-workspace-command="assistant"]',
    );
    openDocument('clerks', assistantEntry, 'workspace');
    return;
  }
  if (command === 'exit') {
    window.dispatchEvent(new CustomEvent('palis:workspace-exit-request'));
    return;
  }
  window.dispatchEvent(new CustomEvent('palis:workspace-command', {
    detail: { command },
  }));
}

desktopStart.addEventListener('click', () => {
  setDesktopStartMenuOpen(desktopStartMenu.hidden);
});

desktop.addEventListener('pointerdown', (event) => {
  if (!desktopStartMenu.hidden
    && !desktopStartMenu.contains(event.target)
    && !desktopStart.contains(event.target)) {
    setDesktopStartMenuOpen(false);
  }
  if (event.target.closest(
    '[data-workspace-shortcut], #clerk-desktop-start-menu, #clerk-desktop-start',
  )) return;
  selectedDesktopShortcut?.classList.remove('is-selected');
  selectedDesktopShortcut = null;
});

desktopCommands
  .filter((entry) => entry.closest('#clerk-desktop-start-menu'))
  .forEach((entry) => entry.addEventListener('click', () => {
    dispatchWorkspaceCommand(entry.dataset.workspaceCommand, entry);
  }));

desktop.querySelectorAll('[data-workspace-shortcut]').forEach((entry) => {
  entry.addEventListener('click', () => {
    desktop.querySelectorAll('[data-workspace-shortcut]').forEach((candidate) => {
      candidate.classList.toggle('is-selected', candidate === entry);
    });
    selectedDesktopShortcut = entry;
  });
  entry.addEventListener('dblclick', () =>
    dispatchWorkspaceCommand(entry.dataset.workspaceCommand, entry));
  entry.addEventListener('pointerup', (event) => {
    if (event.pointerType !== 'mouse') {
      dispatchWorkspaceCommand(entry.dataset.workspaceCommand, entry);
    }
  });
  entry.addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    dispatchWorkspaceCommand(entry.dataset.workspaceCommand, entry);
  });
});
```

Replace the workspace-level Escape branch with:

```js
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!startMenu.hidden) {
    setMenuOpen(false);
    return;
  }
  if (!desktopStartMenu.hidden) {
    setDesktopStartMenuOpen(false);
    desktopStart.focus({ preventScroll: true });
    return;
  }
  if (selectedDesktopShortcut) {
    selectedDesktopShortcut.classList.remove('is-selected');
    selectedDesktopShortcut = null;
  }
});
```

In `workspace.js`, delete the startup `templateButtons` and `panelButtons`
queries and both `.forEach()` listener blocks; those DOM nodes no longer
exist. Replace direct panel-button routing with:

```js
window.addEventListener('palis:workspace-command', (event) => {
  if (!ensureWorkspaceAccess()) return;
  const command = event.detail?.command;
  if (command === 'cabinet') void openArchiveCabinetPanel();
  if (command === 'drafts') void openDraftsPanel();
  if (command === 'inbox') void openInboxPanel();
  if (command === 'review' && canReview(context.role)) void openReviewPanel();
  if (command === 'users' && canReview(context.role)) void openUserManagementPanel();
  if (command === 'archives' && canReview(context.role)) void openArchiveManagementPanel();
});
```

- [ ] **Step 4: Run interaction tests**

Run:

```powershell
node --test tests/clerk-workspace.test.mjs
```

Expected: PASS for the source contract. The browser test is intentionally
deferred until the cabinet is wired in Task 3.

- [ ] **Step 5: Keep command routing in the atomic migration batch**

Do not commit yet. Continue directly to Task 3.

---

### Task 3: Build the PALIS archive cabinet and role-aware category folders

**Files:**

- Create: `src/archive-workflow/archive-cabinet.js`
- Create: `tests/archive-cabinet.test.mjs`
- Modify: `src/archive-workflow/workspace.js`
- Modify: `tests/local-admin-runtime-browser.test.mjs`
- Modify: `scripts/verify-local-admin.mjs`

**Interfaces:**

- Consumes: `ARCHIVE_TEMPLATES` from `src/archive-workflow/templates.js`.
- Produces: `archiveCabinetEntries(role: string): CabinetEntry[]`.
- Produces: `renderArchiveCabinet(role: string): string`.
- `CabinetEntry` shape: `{ code, category, title, abbreviation, defaultKind, restricted, actionLabel }`.

- [ ] **Step 1: Write failing archive-cabinet unit tests**

Create `tests/archive-cabinet.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  archiveCabinetEntries,
  renderArchiveCabinet,
} from '../src/archive-workflow/archive-cabinet.js';

test('archive cabinet contains all nine categories in registry order', () => {
  assert.deepEqual(
    archiveCabinetEntries('admin').map((entry) => entry.code),
    ['01', '02', '03', '04', '05', '06', '07', '08', '09'],
  );
});

test('clerks receive amendment-only station and entrance folders', () => {
  const entries = archiveCabinetEntries('clerk');
  for (const code of ['03', '04']) {
    const entry = entries.find((item) => item.code === code);
    assert.equal(entry.defaultKind, 'amendment');
    assert.equal(entry.restricted, true);
    assert.equal(entry.actionLabel, '仅可申请修改');
  }
  assert.equal(entries.find((item) => item.code === '07').defaultKind, 'new');
});

test('administrator cabinet exposes new, contribution, amendment, and settings authority', () => {
  const html = renderArchiveCabinet('admin');
  assert.equal((html.match(/data-archive-template="\d{2}"/g) || []).length, 9);
  assert.match(html, /可新建／补充／修改／设定/);
  assert.match(html, /C:\\PALIS\\ARCHIVES/);
  assert.match(html, /data-cabinet-menu="file"/);
  assert.match(html, /aria-pressed="true" data-cabinet-action="view-large"/);
  assert.match(html, /data-cabinet-permissions/);
});
```

- [ ] **Step 2: Run the unit test and verify missing module failure**

Run:

```powershell
node --test tests/archive-cabinet.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the cabinet module and workspace window**

Create `src/archive-workflow/archive-cabinet.js`:

```js
import { ARCHIVE_TEMPLATES } from './templates.js';

const FIXED_FOR_CLERK = new Set(['station', 'entrance']);
const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

export const archiveCabinetEntries = (role) => ARCHIVE_TEMPLATES.map((template) => {
  const restricted = role !== 'admin' && FIXED_FOR_CLERK.has(template.category);
  return {
    code: template.code,
    category: template.category,
    title: template.title,
    abbreviation: template.abbreviation,
    defaultKind: restricted ? 'amendment' : 'new',
    restricted,
    actionLabel: restricted ? '仅可申请修改' : role === 'admin'
      ? '可新建／补充／修改／设定'
      : '可新建／补充／修改',
  };
});

export const renderArchiveCabinet = (role) => `
  <section class="archive-cabinet" data-archive-cabinet>
    <nav class="archive-cabinet__menubar" aria-label="档案柜菜单">
      <details data-cabinet-menu="file">
        <summary>文件</summary>
        <div role="menu">
          <button type="button" role="menuitem"
            data-cabinet-action="open" disabled>打开</button>
          <button type="button" role="menuitem"
            data-cabinet-action="close">关闭</button>
        </div>
      </details>
      <details data-cabinet-menu="view">
        <summary>查看</summary>
        <div role="menu">
          <button type="button" role="menuitemradio" aria-checked="true"
            aria-pressed="true" data-cabinet-action="view-large">✓ 大图标</button>
        </div>
      </details>
      <details data-cabinet-menu="help">
        <summary>帮助</summary>
        <div role="menu">
          <button type="button" role="menuitem"
            data-cabinet-action="permissions">类别权限</button>
        </div>
      </details>
    </nav>
    <label class="archive-cabinet__address">地址
      <input value="C:\\PALIS\\ARCHIVES" readonly aria-readonly="true" />
    </label>
    <div class="archive-cabinet__grid" data-archive-cabinet-grid>
      ${archiveCabinetEntries(role).map((entry) => `
        <button type="button" data-archive-template="${escapeHtml(entry.code)}"
          data-default-kind="${escapeHtml(entry.defaultKind)}"
          aria-label="${escapeHtml(`${entry.title}，${entry.actionLabel}`)}">
          <i aria-hidden="true"><img src="/assets/icons/archive-${escapeHtml(entry.category)}.svg" alt="" /></i>
          <b>${escapeHtml(entry.title)}</b>
          <small>${escapeHtml(entry.code)}.${escapeHtml(entry.abbreviation)} / ${escapeHtml(entry.actionLabel)}</small>
        </button>
      `).join('')}
    </div>
    <footer><output data-cabinet-selection>9 个对象</output><span>${escapeHtml(role === 'admin' ? 'ADMIN' : 'CLERK')}</span></footer>
    <dialog data-cabinet-permissions aria-labelledby="cabinet-permission-title">
      <form method="dialog">
        <h3 id="cabinet-permission-title">类别权限</h3>
        <p>${escapeHtml(role === 'admin'
          ? '管理员可新建、补充、修改并管理全部九类档案。'
          : '书记官可处理七类档案；科考站与白幕入口只能提交修改申请。')}</p>
        <button value="close">确定</button>
      </form>
    </dialog>
  </section>
`;
```

In `workspace.js`, change only the `createWindow()` parameter list:

```diff
-const createWindow = ({ key, title, code, body, className = '' }) => {
+const createWindow = ({ key, title, code, body, className = '', icon = '' }) => {
```

Immediately before assigning `windowElement.innerHTML`, define:

```js
const titleIcon = icon
  ? `<img class="archive-workflow-titlebar__icon"
      src="${escapeHtml(icon)}" alt="" aria-hidden="true" />`
  : '';
```

Replace the existing titlebar label line with:

```html
<span>${titleIcon}${escapeHtml(code)} / ${escapeHtml(title)}</span>
```

Replace the workflow task-button body so it reuses the same application icon:

```js
const taskIcon = icon
  ? `<img src="${escapeHtml(icon)}" alt="" aria-hidden="true" />`
  : '<i aria-hidden="true"></i>';
taskButton.innerHTML =
  `${taskIcon}<span><b>${escapeHtml(code)}</b>${escapeHtml(title)}</span>`;
```

For workspace assistant documents, use
`/assets/icons/archive-assistant.svg` in the titlebar and task button. Keep the
public assistant markup unchanged.

Import `renderArchiveCabinet`, add `openArchiveCabinetPanel()`, and bind
selection/open/menu rules:

```js
const openArchiveCabinetPanel = async () => {
  const state = createWindow({
    key: 'archive-cabinet',
    title: 'PALIS 档案柜',
    code: 'C:\\PALIS\\ARCHIVES',
    className: 'archive-cabinet-window',
    icon: '/assets/icons/archive-cabinet.svg',
    body: renderArchiveCabinet(context.role),
  });
  if (state.cabinetReady) return state;
  state.cabinetReady = true;
  const cabinet = state.windowElement.querySelector('[data-archive-cabinet]');
  const openButton = cabinet.querySelector('[data-cabinet-action="open"]');
  const menus = [...cabinet.querySelectorAll('[data-cabinet-menu]')];
  const permissionDialog = cabinet.querySelector('[data-cabinet-permissions]');
  let selected = null;
  const closeMenus = () => menus.forEach((menu) => { menu.open = false; });

  const select = (button) => {
    cabinet.querySelectorAll('[data-archive-template]').forEach((entry) => {
      entry.classList.toggle('is-selected', entry === button);
    });
    selected = button;
    openButton.disabled = !selected;
    cabinet.querySelector('[data-cabinet-selection]').value =
      selected ? `${selected.dataset.archiveTemplate} / ${selected.textContent.trim()}` : '9 个对象';
  };
  const open = (button) => {
    const template = ARCHIVE_TEMPLATE_BY_CODE[button?.dataset.archiveTemplate];
    if (template) void createEditor(template, { kind: button.dataset.defaultKind });
  };

  cabinet.addEventListener('click', (event) => {
    const folder = event.target.closest('[data-archive-template]');
    if (folder) select(folder);
    if (event.target.closest('[data-cabinet-action="open"]')) {
      closeMenus();
      open(selected);
    }
    if (event.target.closest('[data-cabinet-action="close"]')) {
      closeMenus();
      state.windowElement.querySelector('[data-workflow-close]').click();
    }
    if (event.target.closest('[data-cabinet-action="view-large"]')) {
      closeMenus();
    }
    if (event.target.closest('[data-cabinet-action="permissions"]')) {
      closeMenus();
      permissionDialog.showModal();
    }
  });
  menus.forEach((menu) => menu.addEventListener('toggle', () => {
    if (!menu.open) return;
    menus.forEach((other) => { if (other !== menu) other.open = false; });
  }));
  cabinet.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('[data-cabinet-menu]')) closeMenus();
  });
  cabinet.addEventListener('dblclick', (event) => open(event.target.closest('[data-archive-template]')));
  cabinet.addEventListener('pointerup', (event) => {
    if (event.pointerType !== 'mouse') open(event.target.closest('[data-archive-template]'));
  });
  cabinet.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menus.some((menu) => menu.open)) {
      event.preventDefault();
      event.stopPropagation();
      closeMenus();
      return;
    }
    if (!['Enter', ' '].includes(event.key)
      || !event.target.matches('[data-archive-template]')) return;
    event.preventDefault();
    open(event.target);
  });
  return state;
};
```

In `scripts/verify-local-admin.mjs`, add reusable Win95 command helpers and
replace every old desktop-template, workflow-card, and bottom-exit click:

```js
const openWorkspaceCommand = async (page, command) => {
  await page.click(
    `[data-workspace-shortcut][data-workspace-command="${command}"]`,
    { count: 2, delay: 40 },
  );
};

const openCabinetTemplate = async (page, code) => {
  const cabinet = await page.$('.archive-cabinet-window:not([hidden])');
  if (!cabinet) {
    await openWorkspaceCommand(page, 'cabinet');
    await page.waitForSelector('.archive-cabinet-window:not([hidden])');
  }
  await page.click(
    `.archive-cabinet-window [data-archive-template="${code}"]`,
    { count: 2, delay: 40 },
  );
  await page.waitForSelector(`#archive-workflow-editor-${code}:not([hidden])`);
};

const closeEditor = async (page, code, dirtyAction = 'discard') => {
  await page.click(`#archive-workflow-editor-${code} [data-workflow-close]`);
  const confirmation = await page.$('#workspace-exit-dialog[open]');
  if (confirmation) {
    await page.click(
      `[data-workspace-exit-action="${dirtyAction}"]`,
    );
  }
  await page.waitForFunction(
    (id) => !document.querySelector(`#${id}`),
    {},
    `archive-workflow-editor-${code}`,
  );
};

const exitWorkspace = async (page) => {
  await page.click('#clerk-desktop-start');
  await page.click(
    '#clerk-desktop-start-menu [data-workspace-command="exit"]',
  );
  await page.waitForFunction(
    () => !document.body.classList.contains('clerk-desktop-open'),
    { timeout: 10_000 },
  );
};
```

For desktop evidence, open the cabinet first and collect template codes from
`.archive-cabinet-window [data-archive-template]`. Count administrator desktop
shortcuts with
`[data-workspace-shortcut][data-admin-only]:not([hidden])`, which remains
exactly three. Replace archive-management card clicks with
`openWorkspaceCommand(page, 'archives')`.

- [ ] **Step 4: Run cabinet and local-admin tests**

Update the local-admin browser path and assert the cabinet does not preload the
nine HTML templates:

```js
await page.click(
  '[data-workspace-shortcut][data-workspace-command="cabinet"]',
  { count: 2, delay: 40 },
);
await page.waitForSelector('.archive-cabinet-window:not([hidden])');
assert.equal(requests.filter((url) => url.includes('/templates/')).length, 0);
await page.click(
  '.archive-cabinet-window [data-cabinet-menu="help"] > summary',
);
await page.click(
  '.archive-cabinet-window [data-cabinet-action="permissions"]',
);
await page.waitForSelector(
  '.archive-cabinet-window [data-cabinet-permissions][open]',
);
await page.click(
  '.archive-cabinet-window [data-cabinet-permissions] button[value="close"]',
);
await page.click(
  '.archive-cabinet-window [data-archive-template="07"]',
  { count: 2, delay: 40 },
);
await page.waitForSelector('#archive-workflow-editor-07:not([hidden])');
assert.equal(requests.filter((url) => url.includes('/templates/')).length, 1);
```

Run:

```powershell
node --test tests/archive-cabinet.test.mjs tests/local-admin-runtime-browser.test.mjs
```

Expected: PASS with exactly one template HTML request after opening one editor.

- [ ] **Step 5: Keep the cabinet in the atomic migration batch**

Do not commit yet. Continue directly to Task 4 so the new Start-menu exit,
permission revocation, both window managers, and current editor dirty-state
adapter are present before the first runnable checkpoint.

---

### Task 4: Add classic maximize, task-button state, and safe workspace exit

**Files:**

- Modify: `index.html`
- Modify: `src/main.js:250-410`
- Modify: `src/main.js:470-570`
- Modify: `src/auth.js:330-350`
- Modify: `src/archive-workflow/autosave.js`
- Modify: `src/archive-workflow/workspace.js:472-610`
- Modify: `tests/archive-autosave.test.mjs`
- Modify: `tests/workspace-ux-regression.test.mjs`
- Modify: `tests/local-admin-runtime-browser.test.mjs`
- Modify: `tests/archive-workflow-client.test.mjs`

**Interfaces:**

- Produces: `palis:workspace-dirty-change` detail `{ key: string, dirty: boolean }`.
- Produces: cancellable `palis:workspace-leave-request` detail
  `{ keys: string[] | null, proceed(): void, cancel(): void, allowCancel?: boolean }`.
- Produces: `palis:workspace-flush-request` detail
  `{ keys: string[], requests: Promise<unknown>[] }`.
- Produces: `palis:workspace-discard-request` detail `{ keys: string[] }`.
- Produces: `palis:workspace-leave-aborted` when account sign-out fails after
  the operator already chose save/discard, so still-open editors re-arm their
  draft protection.
- Produces: `palis:workspace-scope-change` before a principal or role change is
  committed, so old-scope windows are saved/discarded and closed first.
- Produces: `palis:workspace-close-all` so returning to the public archive
  disposes hidden editor state instead of leaving stale windows behind.
- Consumes: `palis:workspace-sync-state` detail `{ key: string, state: string }`.
- Consumes: the editor plan will register its draft key and handle filtered
  flush/discard events.
- Window state gains `{ maximized: boolean, restoredBounds: { left, top, width, height } | null }`.

- [ ] **Step 1: Add failing maximize/task/exit tests**

Add source assertions:

```js
const authSourceUrl = new URL('../src/auth.js', import.meta.url);

test('classic workspace windows expose minimize maximize and close controls', () => {
  assert.match(workspace, /data-workflow-maximize/);
  assert.match(workspace, /restoredBounds/);
  assert.match(workspace, /is-maximized/);
  assert.match(main, /mascot-document-maximize/);
  assert.match(main, /surface === 'workspace'/);
  assert.match(main, /workspaceMaximizeControl/);
});

test('workspace exit is an explicit dirty-aware action', () => {
  assert.match(html, /id="workspace-exit-dialog"/);
  assert.match(main, /palis:workspace-leave-request/);
  assert.match(main, /palis:workspace-dirty-change/);
  assert.match(main, /palis:workspace-flush-request/);
  assert.match(main, /palis:workspace-discard-request/);
  assert.match(main, /palis:workspace-sync-state/);
  assert.match(workspace, /palis:workspace-scope-change/);
  assert.match(workspace, /previousPrincipalId/);
  assert.doesNotMatch(workspace, /querySelector\('#clerk-desktop-exit'\)/);
});

test('cloud sign-out waits for the workspace leave guard', async () => {
  const authSource = await readFile(authSourceUrl, 'utf8');
  assert.match(authSource, /palis:workspace-leave-request/);
  assert.match(authSource, /if \(!await mayLeaveWorkspace\(\)\) return/);
  assert.match(authSource, /event === 'SIGNED_OUT'/);
  assert.match(authSource, /mayLeaveWorkspace\(\{\s*allowCancel:\s*false/);
  assert.match(authSource, /palis:workspace-leave-aborted/);
  assert.match(authSource, /function showLogin[\s\S]*emitSessionChange/);
  assert.match(authSource, /async function handleSignOut[\s\S]*showLogin/);
  assert.match(authSource, /const revokeToLogin[\s\S]*showLogin/);
  assert.match(workspace, /rearmAfterFailedLeave/);
});
```

Add browser assertions:

```js
// Add at the test module top:
import { resolve } from 'node:path';
```

Raise the existing local-admin test timeout:

```diff
-test('local administrator opens the workspace without loading cloud authentication', { timeout: 30_000 }, async () => {
+test('local administrator opens the workspace without loading cloud authentication', { timeout: 120_000 }, async () => {
```

Before clicking `#clerk-workspace-entry`, prove the public assistant keeps its
old two-button window chrome:

```js
await page.click('#mascot-trigger');
await page.waitForSelector('#mascot-window:not([hidden])');
await page.click('#mascot-window [data-mascot-document="site"]');
await page.waitForSelector(
  '#archive-desktop .mascot-document-window:not([hidden])',
);
assert.equal(
  await page.$(
    '#archive-desktop .mascot-document-window .mascot-document-maximize',
  ),
  null,
);
await page.click(
  '#archive-desktop .mascot-document-window .mascot-document-close',
);
await page.waitForFunction(() =>
  !document.querySelector('#archive-desktop .mascot-document-window'));
```

Then add:

```js

await page.click('.archive-editor-window [data-workflow-maximize]');
assert.equal(
  await page.$eval('.archive-editor-window', (windowElement) =>
    windowElement.classList.contains('is-maximized')),
  true,
);
await page.click(
  '.archive-editor-window [data-workflow-drag-handle]',
  { count: 2, delay: 40 },
);
assert.equal(
  await page.$eval('.archive-editor-window', (windowElement) =>
    windowElement.classList.contains('is-maximized')),
  false,
);

await page.click(
  '[data-workspace-shortcut][data-workspace-command="assistant"]',
  { count: 2, delay: 40 },
);
await page.waitForSelector(
  '#assistant-window-layer .mascot-document-window:not([hidden])',
);
await page.click(
  '#assistant-window-layer .mascot-document-window .mascot-document-maximize',
);
assert.equal(
  await page.$eval(
    '#assistant-window-layer .mascot-document-window',
    (windowElement) => windowElement.classList.contains('is-maximized'),
  ),
  true,
);
await page.click(
  '#assistant-window-layer .mascot-document-window .mascot-document-close',
);
assert.equal(
  await page.$eval('[data-workspace-tray-role]', (node) => node.textContent),
  '管理员',
);
await page.click('[data-workspace-tray="sync"]');
await page.waitForSelector('#workspace-sync-dialog[open]');
await page.click('#workspace-sync-dialog button[value="close"]');

const attachment = await page.$(
  '.archive-editor-window input[name="attachments"]',
);
await attachment.uploadFile(
  resolve(process.cwd(), 'public/assets/mascot/idle-02.png'),
);
await page.click('#clerk-desktop-start');
await page.click(
  '#clerk-desktop-start-menu [data-workspace-command="exit"]',
);
await page.waitForSelector('#workspace-exit-dialog[open]');
await page.click('[data-workspace-exit-action="save"]');
await page.waitForFunction(() =>
  document.querySelector('[data-workspace-exit-message]')
    ?.textContent.includes('图片或附件'));
assert.equal(
  await page.$eval('#clerk-desktop', (node) => node.hidden),
  false,
);
await page.click('[data-workspace-exit-action="cancel"]');
await page.click('.archive-editor-window [data-workflow-close]');
await page.waitForSelector('#workspace-exit-dialog[open]');
await page.click('[data-workspace-exit-action="discard"]');

// A principal/role transition closes the old privileged scope before the
// lower-privilege desktop can be entered, and cannot silently drop a dirty
// editor.
await openCabinetTemplate(page, '01');
await page.$eval(
  '#archive-workflow-editor-01 [data-index-key="title"]',
  (control) => {
    control.value = '权限切换保护';
    control.dispatchEvent(new Event('input', { bubbles: true }));
  },
);
await page.evaluate(() => {
  document.body.dataset.operatorRole = 'clerk';
  window.dispatchEvent(new CustomEvent('palis:session-change', {
    detail: {
      session: { user: { id: 'local-admin' } },
      profile: {
        id: 'local-admin',
        role: 'clerk',
        display_name: '本地书记官',
      },
      role: 'clerk',
      preview: false,
    },
  }));
});
await page.waitForSelector('#workspace-exit-dialog[open]');
assert.equal(
  await page.$eval(
    '[data-workspace-exit-action="cancel"]',
    (button) => button.hidden,
  ),
  true,
);
await page.click('[data-workspace-exit-action="discard"]');
await page.waitForFunction(() =>
  !document.body.classList.contains('clerk-desktop-open'));
assert.equal(
  await page.$$eval('#assistant-task-list > button', (items) => items.length),
  0,
);
await page.click('#clerk-workspace-entry');
await page.waitForSelector('body.clerk-desktop-open');
assert.equal(
  await page.$eval(
    '[data-workspace-shortcut][data-workspace-command="review"]',
    (button) => button.hidden,
  ),
  true,
);
await page.click(
  '[data-workspace-shortcut][data-workspace-command="cabinet"]',
  { count: 2, delay: 40 },
);
for (const code of ['03', '04']) {
  assert.equal(
    await page.$eval(
      `.archive-cabinet-window [data-archive-template="${code}"]`,
      (button) => button.dataset.defaultKind,
    ),
    'amendment',
  );
}
```

- [ ] **Step 2: Run tests and verify missing behavior**

Run:

```powershell
node --test tests/workspace-ux-regression.test.mjs tests/local-admin-runtime-browser.test.mjs
```

Expected: FAIL because maximize buttons, restored bounds, and dirty-aware exit contracts are absent.

- [ ] **Step 3: Implement window-state transitions and exit coordination**

Add this maximize control to the workflow titlebar generated by
`workspace.js:createWindow()`:

```html
<button type="button" data-workflow-minimize aria-label="最小化窗口">_</button>
<button type="button" data-workflow-maximize aria-label="最大化窗口">□</button>
<button type="button" data-workflow-close aria-label="关闭窗口">×</button>
```

Add a maximize control to the assistant titlebar generated by
`main.js:openDocument()` only for `surface === 'workspace'`. The public PALIS
assistant keeps its current two-button titlebar:

```js
const workspaceMaximizeControl = surface === 'workspace'
  ? '<button type="button" class="mascot-document-maximize" aria-label="最大化窗口">□</button>'
  : '';
```

Insert `${workspaceMaximizeControl}` between the existing minimize and close
buttons. Also set `windowElement.dataset.mascotSurface = surface` and capture
`returnFocus: document.activeElement` in the document-window state.

In `workspace.js:createWindow()`, extend `state` with `maximized: false`,
`restoredBounds: null`, `dirtyKey: null`, and `closing: false`, then add this
workflow-window transition:

```js
const toggleMaximize = () => {
  if (!state.maximized) {
    const rect = windowElement.getBoundingClientRect();
    state.restoredBounds = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  }
  state.maximized = !state.maximized;
  windowElement.classList.toggle('is-maximized', state.maximized);
  if (!state.maximized && state.restoredBounds) {
    Object.assign(windowElement.style, {
      left: `${state.restoredBounds.left}px`,
      top: `${state.restoredBounds.top}px`,
      width: `${state.restoredBounds.width}px`,
      height: `${state.restoredBounds.height}px`,
    });
  } else {
    for (const property of ['left', 'top', 'width', 'height']) {
      windowElement.style.removeProperty(property);
    }
  }
  focusWindow(windowElement);
};
```

Bind it explicitly:

```js
const maximizeButton = windowElement.querySelector('[data-workflow-maximize]');
maximizeButton.addEventListener('click', toggleMaximize);
windowElement
  .querySelector('[data-workflow-drag-handle]')
  .addEventListener('dblclick', (event) => {
    if (event.target.closest('button')) return;
    toggleMaximize();
  });
```

Add `windowElement.classList.contains('is-maximized')` to the early-return
condition in both `installWindowDrag()` and `installDocumentWindowDrag()`.
Titlebar double-click remains available so a desktop user can restore the
window before dragging.

In `main.js:openDocument()`, extend the assistant-document `state` with
`maximized: false` and `restoredBounds: null`, then use the assistant manager's
own focus function:

```js
const toggleDocumentMaximize = () => {
  if (!state.maximized) {
    const rect = windowElement.getBoundingClientRect();
    state.restoredBounds = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  }
  state.maximized = !state.maximized;
  windowElement.classList.toggle('is-maximized', state.maximized);
  if (state.maximized) {
    for (const property of ['left', 'top', 'width', 'height']) {
      windowElement.style.removeProperty(property);
    }
  } else if (state.restoredBounds) {
    Object.assign(windowElement.style, {
      left: `${state.restoredBounds.left}px`,
      top: `${state.restoredBounds.top}px`,
      width: `${state.restoredBounds.width}px`,
      height: `${state.restoredBounds.height}px`,
    });
  }
  focusDocumentWindow(windowElement, true);
};

const documentMaximize = windowElement.querySelector(
  '.mascot-document-maximize',
);
if (state.surface === 'workspace' && documentMaximize) {
  documentMaximize.addEventListener('click', toggleDocumentMaximize);
  windowElement
    .querySelector('.mascot-document-titlebar')
    .addEventListener('dblclick', (event) => {
      if (event.target.closest('button')) return;
      toggleDocumentMaximize();
    });
}
```

Make the two existing managers share one workspace focus/z-order coordinator.
Do not merge their Maps; coordinate only windows inside
`#assistant-window-layer`:

```js
let workspaceWindowZ = 22500;
window.addEventListener('palis:workspace-window-focus', (event) => {
  const target = event.detail?.windowElement;
  const task = event.detail?.taskButton;
  if (!(target instanceof HTMLElement)
    || !desktopWindowLayer.contains(target)) return;
  workspaceWindowZ += 1;
  desktopWindowLayer.querySelectorAll(
    '.archive-workflow-window, .mascot-document-window[data-mascot-surface="workspace"]',
  ).forEach((candidate) => {
    candidate.classList.toggle('is-active', candidate === target);
  });
  desktopTaskList.querySelectorAll('.archive-task-button').forEach((button) => {
    const active = button === task;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  target.style.zIndex = String(workspaceWindowZ);
  if (event.detail?.owner === 'workflow'
    && activeDocumentWindow?.dataset.mascotSurface === 'workspace') {
    activeDocumentWindow = null;
  }
});
```

At the end of `workspace.js:focusWindow()`, dispatch:

```js
window.dispatchEvent(new CustomEvent('palis:workspace-window-focus', {
  detail: {
    owner: 'workflow',
    windowElement,
    taskButton: taskList.querySelector(
      `[aria-controls="${CSS.escape(windowElement.id)}"]`,
    ),
  },
}));
```

At the end of `main.js:focusDocumentWindow()`, dispatch the same event only
when `state.surface === 'workspace'`, with `owner: 'assistant'` and
`taskButton: state.taskButton`. Existing outer-assistant focus behavior stays
unchanged.

Extend `closeDocumentWindow(windowElement, { immediate = false } = {})`;
`immediate` bypasses its closing animation. In `removeWindow()`, restore
`state.returnFocus` when it is still connected. Then close workspace assistant
documents together with workflow windows:

```js
window.addEventListener('palis:workspace-close-all', () => {
  setDesktopStartMenuOpen(false);
  [...openDocuments.values()]
    .filter((state) => state.surface === 'workspace')
    .forEach((state) =>
      closeDocumentWindow(state.windowElement, { immediate: true }));
});
```

Update the close-all browser path to exit and re-enter once, then assert:

```js
await page.click(
  '[data-workspace-shortcut][data-workspace-command="cabinet"]',
  { count: 2, delay: 40 },
);
await page.click(
  '[data-workspace-shortcut][data-workspace-command="assistant"]',
  { count: 2, delay: 40 },
);
await page.waitForSelector(
  '#assistant-window-layer .mascot-document-window:not([hidden])',
);
assert.equal(
  await page.$$eval(
    '#assistant-window-layer .is-active',
    (nodes) => nodes.length,
  ),
  1,
);
await page.click('#clerk-desktop-start');
await page.click(
  '#clerk-desktop-start-menu [data-workspace-command="exit"]',
);
await page.waitForFunction(
  () => !document.body.classList.contains('clerk-desktop-open'),
);
await page.click('#clerk-workspace-entry');
await page.waitForSelector('body.clerk-desktop-open');
assert.equal(await page.$$('#assistant-task-list > button').then((items) => items.length), 0);
```

Change workflow task-button behavior:

```js
taskButton.addEventListener('click', () => {
  if (state.minimized) {
    toggleMinimize();
    return;
  }
  if (windowElement.classList.contains('is-active')) {
    toggleMinimize();
    return;
  }
  focusWindow(windowElement);
  windowElement.focus({ preventScroll: true });
});
```

In `main.js`, keep role, watermark, and the read-only tray status live:

```js
const workspaceSyncStates = new Map();
const syncDialog = document.querySelector('#workspace-sync-dialog');
const syncSummary = syncDialog.querySelector('[data-workspace-sync-summary]');
const syncTrayButton = desktop.querySelector('[data-workspace-tray="sync"]');

const updateWorkspaceIdentityAndSync = () => {
  const role = document.body.dataset.operatorRole === 'admin' ? 'admin' : 'clerk';
  const roleLabel = role === 'admin' ? '管理员' : '书记官';
  const roleCode = role === 'admin' ? 'ADMIN' : 'CLERK';
  desktop.querySelectorAll('[data-workspace-tray-role]')
    .forEach((node) => { node.textContent = roleLabel; });
  desktop.querySelectorAll('[data-workspace-watermark-role]')
    .forEach((node) => { node.textContent = roleCode; });

  const states = [...workspaceSyncStates.values()];
  const offlineStates = new Set([
    'offline-saved',
    'network-error',
    'session-expired',
    'permission-denied',
    'cloud-error',
  ]);
  const connection = states.some((state) => offlineStates.has(state))
    ? 'OFFLINE'
    : states.some((state) => state === 'cloud-syncing')
      ? 'SYNCING'
      : states.some((state) => state === 'local-saving' || state === 'local-saved')
        ? 'LOCAL'
        : document.body.dataset.accessMode === 'local-admin'
          ? 'LOCAL'
          : 'ONLINE';
  desktop.querySelectorAll(
    '[data-workspace-connection], [data-workspace-watermark-connection]',
  ).forEach((node) => { node.textContent = connection; });
  syncTrayButton.dataset.state = connection.toLowerCase();
  syncSummary.textContent = states.length
    ? `${states.length} 个编辑器；当前连接状态：${connection}。`
    : `当前没有打开的档案编辑器；连接状态：${connection}。`;
};

window.addEventListener('palis:workspace-sync-state', (event) => {
  const key = String(event.detail?.key ?? '');
  if (!key) return;
  if (event.detail?.state === 'closed') workspaceSyncStates.delete(key);
  else workspaceSyncStates.set(key, String(event.detail?.state ?? 'local-saved'));
  updateWorkspaceIdentityAndSync();
});
window.addEventListener('palis:session-change', updateWorkspaceIdentityAndSync);
syncTrayButton.addEventListener('click', () => syncDialog.showModal());
updateWorkspaceIdentityAndSync();
```

Replace the direct workflow close handler with one close function. Windows
without a draft key still close immediately; an editor will assign its
`dirtyKey` in the editor plan:

```js
const closeWindow = async () => {
  if (state.closing) return;
  state.closing = true;
  windows.delete(key);
  taskButton.remove();
  windowElement.remove();
  updateTaskList();
  if (state.returnFocus?.isConnected) {
    state.returnFocus.focus({ preventScroll: true });
  }
  try {
    await state.dispose?.();
  } catch (error) {
    console.error('PALIS window cleanup failed', error);
  }
};
state.close = closeWindow;

windowElement.querySelector('[data-workflow-close]').addEventListener('click', () => {
  if (!state.dirtyKey) {
    void closeWindow();
    return;
  }
  window.dispatchEvent(new CustomEvent('palis:workspace-leave-request', {
    cancelable: true,
    detail: {
      keys: [state.dirtyKey],
      proceed: () => { void closeWindow(); },
      cancel: () => {},
    },
  }));
});
```

Coordinate safe exit in `main.js`. `keys: null` means every currently dirty
editor, while a concrete key list protects one editor-window close:

```js
const dirtyWorkspaceKeys = new Set();
const exitDialog = document.querySelector('#workspace-exit-dialog');
const exitMessage = exitDialog.querySelector('[data-workspace-exit-message]');
let pendingWorkspaceLeave = null;

window.addEventListener('palis:workspace-dirty-change', (event) => {
  const key = String(event.detail?.key ?? '');
  if (!key) return;
  if (event.detail?.dirty) dirtyWorkspaceKeys.add(key);
  else dirtyWorkspaceKeys.delete(key);
});

function requestWorkspaceLeave({
  keys = null,
  proceed = () => {},
  cancel = () => {},
  allowCancel = true,
} = {}) {
  const requestedKeys = Array.isArray(keys)
    ? keys.filter((key) => dirtyWorkspaceKeys.has(key))
    : [...dirtyWorkspaceKeys];
  if (!requestedKeys.length) {
    proceed();
    return;
  }
  pendingWorkspaceLeave = {
    keys: requestedKeys,
    proceed,
    cancel,
    allowCancel,
  };
  exitDialog.querySelector(
    '[data-workspace-exit-action="cancel"]',
  ).hidden = !allowCancel;
  exitMessage.textContent = requestedKeys.length === 1
    ? '此档案仍有未同步内容。可保存到本地后关闭，或放弃本地未保存修改。'
    : `${requestedKeys.length} 份档案仍有未同步内容。可全部保存到本地后离开。`;
  exitDialog.showModal();
}

function requestWorkspaceExit() {
  requestWorkspaceLeave({
    keys: null,
    proceed: () => {
      window.dispatchEvent(new CustomEvent('palis:workspace-close-all'));
      setDesktopOpen(false);
    },
  });
}

window.addEventListener('palis:workspace-exit-request', requestWorkspaceExit);

window.addEventListener('palis:workspace-leave-request', (event) => {
  event.preventDefault();
  requestWorkspaceLeave({
    keys: event.detail?.keys ?? null,
    proceed: event.detail?.proceed,
    cancel: event.detail?.cancel,
    allowCancel: event.detail?.allowCancel !== false,
  });
});

window.addEventListener('palis:workspace-scope-change', (event) => {
  requestWorkspaceLeave({
    keys: null,
    allowCancel: false,
    proceed: () => {
      window.dispatchEvent(new CustomEvent('palis:workspace-close-all'));
      setDesktopOpen(false);
      event.detail?.commit?.();
    },
  });
});

exitDialog.addEventListener('cancel', (event) => {
  if (pendingWorkspaceLeave?.allowCancel === false) {
    event.preventDefault();
    return;
  }
  const pending = pendingWorkspaceLeave;
  pendingWorkspaceLeave = null;
  pending?.cancel();
});

exitDialog.addEventListener('click', async (event) => {
  const action = event.target.closest('[data-workspace-exit-action]')?.dataset.workspaceExitAction;
  if (!action || !pendingWorkspaceLeave) return;
  const pending = pendingWorkspaceLeave;
  if (action === 'cancel') {
    if (!pending.allowCancel) return;
    pendingWorkspaceLeave = null;
    exitDialog.close('cancel');
    pending.cancel();
    return;
  }
  if (action === 'save') {
    const requests = [];
    window.dispatchEvent(new CustomEvent('palis:workspace-flush-request', {
      detail: { keys: pending.keys, requests },
    }));
    const results = await Promise.allSettled(requests);
    if (requests.length !== pending.keys.length
      || results.some((result) => result.status === 'rejected')) {
      const hasVolatileFiles = results.some((result) =>
        result.status === 'rejected'
        && /图片或附件/.test(String(result.reason?.message ?? '')));
      exitMessage.textContent = hasVolatileFiles
        ? '仍有待上传的图片或附件；它们不能写入本地暂存。请继续编辑并提交，或明确放弃。'
        : '至少一份档案未能保存到本地，工作台仍保持打开。';
      return;
    }
  }
  if (action === 'discard') {
    window.dispatchEvent(new CustomEvent('palis:workspace-discard-request', {
      detail: { keys: pending.keys },
    }));
  }
  pending.keys.forEach((key) => dirtyWorkspaceKeys.delete(key));
  pendingWorkspaceLeave = null;
  exitDialog.close(action);
  pending.proceed();
});
```

Install the dirty producer in the current editor in the same atomic batch;
safe-exit is not considered implemented until this adapter is present. In
`autosave.js`, include `updatedAt: snapshot.updatedAt` in the
`cloud-synced` event detail. `updatedAt` is also the draft generation, so make
it strictly monotonic even when two edits are queued in the same millisecond:

```js
let lastQueuedAt = 0;

// Inside queue(), before assigning pendingDraft:
const clockValue = Number(now());
const draftValue = Number(draft?.updatedAt);
const generationFloor = Math.max(
  lastQueuedAt,
  Number.isFinite(draftValue) ? draftValue : 0,
);
const updatedAt = Math.max(
  Number.isFinite(clockValue) ? clockValue : Date.now(),
  generationFloor + 1,
);
lastQueuedAt = updatedAt;
```

Use this `updatedAt` in `pendingDraft` instead of a second `now()` call. Add
these regression tests:

```js
test('cloud-synced identifies the exact queued draft generation', async () => {
  const storage = createMemoryStorage();
  const scheduler = createScheduler();
  const states = [];
  const controller = createAutosaveController({
    storage,
    remote: { saveDraft: async () => ({ status: 'ok' }) },
    schedule: scheduler.schedule,
    cancelSchedule: scheduler.cancel,
    now: scheduler.now,
    onState: (state, detail) => states.push({ state, detail }),
  });
  const queued = controller.queue({
    key: 'draft:generation',
    revision: 1,
    content: '第一代',
  });
  await controller.flushRemote();
  const synced = states.find(({ state }) => state === 'cloud-synced');
  assert.equal(synced.detail.updatedAt, queued.updatedAt);
});

test('same-tick queues remain ordered and an old sync identifies only its generation',
  async () => {
    const storage = createMemoryStorage();
    const scheduler = createScheduler();
    let releaseFirst;
    const states = [];
    const controller = createAutosaveController({
      storage,
      remote: {
        saveDraft: async () => new Promise((resolve) => {
          releaseFirst = () => resolve({ status: 'ok' });
        }),
      },
      schedule: scheduler.schedule,
      cancelSchedule: scheduler.cancel,
      now: () => 10,
      onState: (state, detail) => states.push({ state, detail }),
    });
    const first = controller.queue({
      key: 'draft:race',
      revision: 1,
      content: '第一代',
    });
    const firstSync = controller.flushRemote();
    while (!releaseFirst) await Promise.resolve();
    const second = controller.queue({
      key: 'draft:race',
      revision: 1,
      content: '第二代',
    });
    assert.ok(second.updatedAt > first.updatedAt);
    releaseFirst();
    await firstSync;
    const synced = states.find(({ state }) => state === 'cloud-synced');
    assert.equal(synced.detail.updatedAt, first.updatedAt);
    assert.ok(synced.detail.updatedAt < second.updatedAt);
  });
```

After `localKey` in `workspace.js:createEditor()`, initialize:

```js
windowState.dirtyKey = localKey;
let editorDirty = false;
let submitted = false;
let latestQueuedAt = 0;
let latestSyncedAt = 0;
const hasVolatileFileSelection = () =>
  pendingMediaSelections.size > 0
  || form.elements.attachments.files.length > 0;
const draftGeneration = (value, fallback = Date.now()) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const reportDirtyState = () => {
  window.dispatchEvent(new CustomEvent('palis:workspace-dirty-change', {
    detail: {
      key: localKey,
      dirty: !submitted && (editorDirty || hasVolatileFileSelection()),
    },
  }));
};
const markEditorDirty = () => {
  if (form.dataset.editorSubmissionState !== 'submitted') {
    submitted = false;
  }
  editorDirty = true;
  reportDirtyState();
};
```

Change `setAutosaveState(state, detail = {})` so it retains its current output
update and also publishes sync/dirty state:

```js
if (state === 'cloud-synced') {
  latestSyncedAt = Math.max(
    latestSyncedAt,
    draftGeneration(detail.updatedAt, 0),
  );
  editorDirty = latestSyncedAt < latestQueuedAt;
}
window.dispatchEvent(new CustomEvent('palis:workspace-sync-state', {
  detail: { key: localKey, state },
}));
reportDirtyState();
```

After `collectDraft()`, add this wrapper and replace every
`autosave.queue(collectDraft())` inside `createEditor()` with it:

```js
const queueDraftAutosave = () => {
  const queued = autosave.queue(collectDraft());
  latestQueuedAt = Math.max(
    latestQueuedAt,
    draftGeneration(queued.updatedAt),
  );
  markEditorDirty();
  return queued;
};
```

When local recovery is selected, update `latestQueuedAt` from
`recovery.local.updatedAt`, call `markEditorDirty()`, and then retain the
current `setAutosaveState('local-saved')`. The cloud recovery branch remains
clean.

Media file selections and pending captions are not serialized to localStorage.
Call `markEditorDirty()` in the media `change`, metadata `input`, and remove
handlers. A “save then leave” request must refuse to close while any volatile
file input remains selected:

```js
const flushForWorkspaceExit = (event) => {
  if (!event.detail?.keys?.includes(localKey)) return;
  if (hasVolatileFileSelection()) {
    event.detail.requests.push(Promise.reject(
      new Error('图片或附件必须提交上传，不能只保存到本地'),
    ));
    return;
  }
  event.detail.requests.push(autosave.flushLocal());
};
const discardForWorkspaceExit = (event) => {
  if (!event.detail?.keys?.includes(localKey)) return;
  autosave.clear(localKey);
  submitted = true;
  editorDirty = false;
  reportDirtyState();
};
const rearmAfterFailedLeave = () => {
  if (form.dataset.editorSubmissionState === 'submitted') return;
  submitted = false;
  queueDraftAutosave();
};
window.addEventListener('palis:workspace-flush-request', flushForWorkspaceExit);
window.addEventListener('palis:workspace-discard-request', discardForWorkspaceExit);
window.addEventListener('palis:workspace-leave-aborted', rearmAfterFailedLeave);
window.dispatchEvent(new CustomEvent('palis:workspace-sync-state', {
  detail: { key: localKey, state: 'local-saved' },
}));
```

On editor disposal, remove all three listeners, publish dirty `false` and sync
state `closed`, then run the current bridge/autosave cleanup. This adapter is
the same contract consumed later by the unified-editor plan; that plan must
extend it, not register a second copy.

In `auth.js`, add this guard and await it at the first line of
`handleSignOut()`. The same guard must delay the login gate during an automatic
`SIGNED_OUT`; otherwise `setExperienceLocked(true)` would make the workspace's
own exit dialog unreachable before volatile files are handled:

```js
const mayLeaveWorkspace = ({ allowCancel = true } = {}) =>
  new Promise((resolve) => {
    const event = new CustomEvent('palis:workspace-leave-request', {
      cancelable: true,
      detail: {
        keys: null,
        proceed: () => resolve(true),
        cancel: () => resolve(false),
        allowCancel,
      },
    });
    window.dispatchEvent(event);
    if (!event.defaultPrevented) resolve(true);
  });

async function handleSignOut() {
  if (!await mayLeaveWorkspace()) return;
  if (previewMode) {
    pendingSession = null;
    passwordInput.value = '';
    showLogin('已退出预览模式。输入凭据可接入完整档案。');
    return;
  }
  if (!supabase || signingOut) return;
  signingOut = true;
  signOutButton.disabled = true;
  const { error } = await supabase.auth.signOut();
  signingOut = false;
  signOutButton.disabled = false;
  if (error) {
    window.dispatchEvent(new CustomEvent(
      'palis:workspace-leave-aborted',
    ));
    return;
  }
  pendingSession = null;
  activeProfile = null;
  updateSessionDisplay(null);
  passwordInput.value = '';
  showLogin('当前会话已安全结束，请重新输入凭据。');
}

const revokeToLogin = async (message) => {
  await mayLeaveWorkspace({ allowCancel: false });
  showLogin(message);
};

// Inside onAuthStateChange:
} else if (event === 'SIGNED_OUT' && !signingOut) {
  pendingSession = null;
  updateSessionDisplay(null);
  if (gate.hidden) {
    void revokeToLogin('当前会话已失效，请重新登录。');
  }
}
```

Keep the existing `emitSessionChange(null, null, false)` inside `showLogin()`.
That emission is the mandatory observer-scope transition: normal sign-out
reaches it from `handleSignOut()`, and automatic expiration reaches it from
`revokeToLogin()`. Because the dirty guard has already resolved, the
`palis:workspace-scope-change` coordinator then closes old administrator or
clerk windows before the login gate becomes active.

Finally, replace the obsolete `#clerk-desktop-exit` lookup and split
`workspace.js:applySession()` into a guarded scope transition plus the existing
DOM/session mutation. A scope is the pair `(profile.id, role)`: changing
identity, changing role, or becoming an observer while the desktop is open
must save/discard and close the old scope before the new session is committed.
Move the current `applySession()` body into `commitSession(next)` and add:

```js
const commitSession = ({
  session = null,
  profile = null,
  role = null,
  preview = false,
} = {}) => {
  context.session = session;
  context.profile = profile;
  context.role = role || 'observer';
  context.preview = preview;
  const allowed = canEnterWorkspace(context.role) && !preview;
  workspaceEntry.hidden = !allowed;
  workspaceEntry.disabled = !allowed;
  workspaceEntry.removeAttribute('data-access-denied');
  adminButtons.forEach((button) => {
    button.hidden = !canReview(context.role);
  });
  const workspaceName = context.role === 'admin'
    ? '管理员工作台'
    : '书记官工作台';
  const workspaceNameEnglish = context.role === 'admin'
    ? 'ADMIN WORKSPACE'
    : 'CLERK WORKSPACE';
  const profileName = context.profile?.display_name
    || context.profile?.email
    || (context.role === 'admin' ? '管理员' : '书记官');
  const greetingRole = context.role === 'admin' ? '管理员' : '书记官';
  const greetingName = profileName.includes(greetingRole)
    ? profileName
    : `${greetingRole} ${profileName}`;
  workspaceNameOutputs.forEach((output) => {
    output.textContent = workspaceName;
  });
  workspaceNameEnglishOutputs.forEach((output) => {
    output.textContent = workspaceNameEnglish;
  });
  workspaceGreetingOutputs.forEach((output) => {
    output.textContent = allowed
      ? `欢迎您，${greetingName}`
      : '工作台未授权';
  });
  root.setAttribute('aria-label', workspaceName);
  root.querySelector('#assistant-taskbar')?.setAttribute(
    'aria-label',
    `${workspaceName}任务栏`,
  );
  if (roleOutput) {
    roleOutput.textContent = context.role === 'admin'
      ? 'ADMIN / 管理员'
      : context.role === 'clerk'
        ? 'CLERK / 书记官'
        : 'OBSERVER / 观察员';
  }
  setWorkspaceMessage(
    allowed ? 'WORKSPACE READY' : 'READ ONLY / WORKSPACE LOCKED',
  );
};

const applySession = (next = {}) => {
  const previousPrincipalId = context.profile?.id ?? null;
  const nextPrincipalId = next.profile?.id ?? null;
  const previousRole = context.role || 'observer';
  const nextRole = next.role || 'observer';
  const desktopIsOpen = document.body.classList.contains(
    'clerk-desktop-open',
  );
  const scopeChanged = desktopIsOpen
    && canEnterWorkspace(previousRole)
    && (
      previousPrincipalId !== nextPrincipalId
      || previousRole !== nextRole
    );

  if (scopeChanged) {
    window.dispatchEvent(new CustomEvent('palis:workspace-scope-change', {
      detail: { commit: () => commitSession(next) },
    }));
    return;
  }
  commitSession(next);
};
```

Register one workspace listener for both normal exit and access revocation:

```js
window.addEventListener('palis:workspace-close-all', () => {
  [...windows.values()].forEach((state) => { void state.close?.(); });
});
```

The `palis:workspace-scope-change` handler in `main.js` is the non-cancellable
dirty-aware handler shown above. Do **not** set `desktop.inert`: the native
exit dialog lives inside that subtree and `showModal()` already blocks the rest
of the document. Only after a successful local flush or explicit discard does
the handler dispatch `palis:workspace-close-all`, hide the desktop, and call
`event.detail.commit()`. A volatile image/attachment therefore keeps the modal
and old scope alive until the operator explicitly chooses discard; an
authentication callback must never bypass this coordinator.

Keep narrow-screen maximization separate from the user's desktop maximize
state so resizing back to desktop restores the prior geometry. In
`workspace.js`, create one manager-lifetime media query:

```js
const narrowWorkspaceQuery = matchMedia('(max-width: 760px)');
const syncWorkflowViewport = () => {
  windows.forEach((state) => {
    state.windowElement.classList.toggle(
      'is-narrow-forced',
      narrowWorkspaceQuery.matches,
    );
  });
};
narrowWorkspaceQuery.addEventListener('change', syncWorkflowViewport);
```

Call `syncWorkflowViewport()` after adding each state. In `main.js`, register
the equivalent listener over `openDocuments`, filtering
`state.surface === 'workspace'`, and call it after opening a workspace
assistant document. Both maximize toggles must return early while the query
matches. CSS hides the maximize buttons at this width. The browser test must
resize desktop → 390px → desktop and assert `is-narrow-forced` is added and
then removed without changing `state.maximized`.

- [ ] **Step 4: Run window and exit tests**

Run:

```powershell
node --test tests/archive-autosave.test.mjs tests/workspace-ux-regression.test.mjs tests/local-admin-runtime-browser.test.mjs tests/archive-workflow-client.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit the complete runnable shell migration**

```powershell
git add -- index.html public/assets/icons/archive-assistant.svg public/assets/icons/archive-cabinet.svg public/assets/icons/archive-management.svg scripts/verify-local-admin.mjs src/main.js src/auth.js src/archive-workflow/archive-cabinet.js src/archive-workflow/autosave.js src/archive-workflow/workspace.js tests/archive-autosave.test.mjs tests/archive-cabinet.test.mjs tests/archive-workflow-client.test.mjs tests/clerk-workspace.test.mjs tests/clerk-workflow-ui.test.mjs tests/local-admin-runtime-browser.test.mjs tests/workspace-ux-regression.test.mjs
git commit -m "feat: add runnable Win95 workspace shell"
```

---

### Task 5: Apply Win95 visual hierarchy and verify the shell at three viewports

**Files:**

- Modify: `src/style.css:8001-8795`
- Modify: `src/archive-workflow/workspace.css:1-110`
- Modify: `scripts/compare-palis-baseline.mjs`
- Modify: `tests/clerk-workspace.test.mjs`
- Modify: `tests/palis-baseline-harness.test.mjs`
- Modify: `tests/workspace-ux-regression.test.mjs`
- Modify: `tests/local-admin-runtime-browser.test.mjs`

**Interfaces:**

- Consumes: shell classes and window states from Tasks 1–4.
- Produces: one visual language for `.clerk-desktop`, `.clerk-desktop__start-menu`, `.clerk-desktop__taskbar`, `.archive-workflow-window`, `.archive-cabinet`, and `.is-maximized`.

- [ ] **Step 1: Add failing CSS and viewport assertions**

Add:

```js
test('workspace shell uses a classic desktop taskbar and archive cabinet', () => {
  const refinement = styles.slice(styles.indexOf('/* Clerk workspace refinement'));
  assert.match(refinement, /\.clerk-desktop__start-menu/);
  assert.match(refinement, /\.clerk-desktop__tray/);
  assert.match(refinement, /\.clerk-desktop__icons\s*\{[^}]*grid-auto-flow:\s*column/s);
  assert.match(workflowStyles, /\.archive-cabinet__grid/);
  assert.match(workflowStyles, /\.archive-workflow-window\.is-maximized/);
  assert.match(refinement, /\.mascot-document-window\.is-maximized/);
  assert.doesNotMatch(
    workflowStyles,
    /\.clerk-desktop__(?:icons|icon|utilities|welcome)/,
  );
  assert.doesNotMatch(
    refinement,
    /\.clerk-desktop__(?:identity|status|channel|exit)(?:\W|$)/,
  );
});
```

In the browser test, inspect each viewport:

```js
import { mkdir } from 'node:fs/promises';

const shellCaptureDirectory = resolve(
  process.cwd(),
  'tmp',
  'ui-check',
  'win95-shell',
);

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 2048, height: 1152 },
  { width: 390, height: 844 },
]) {
  await page.setViewport(viewport);
  const metrics = await page.evaluate(() => ({
    taskbarHeight: document.querySelector('#assistant-taskbar').getBoundingClientRect().height,
    startVisible: !document.querySelector('#clerk-desktop-start').hidden,
    utilities: Boolean(document.querySelector('.clerk-desktop__utilities')),
    iconFlow: getComputedStyle(
      document.querySelector('.clerk-desktop__icons'),
    ).gridAutoFlow,
    iconWidth: document.querySelector(
      '.clerk-desktop__icon',
    ).getBoundingClientRect().width,
  }));
  assert.equal(metrics.startVisible, true);
  assert.equal(metrics.utilities, false);
  assert.equal(metrics.iconFlow, viewport.width <= 760 ? 'row' : 'column');
  assert.equal(metrics.iconWidth, 32);
  assert.ok(metrics.taskbarHeight >= (viewport.width <= 760 ? 44 : 34));
  if (process.env.PALIS_CAPTURE_UI === '1') {
    await mkdir(shellCaptureDirectory, { recursive: true });
    await page.screenshot({
      path: resolve(
        shellCaptureDirectory,
        `desktop-${viewport.width}x${viewport.height}.png`,
      ),
    });
  }
}
```

- [ ] **Step 2: Run the tests and verify style failure**

Run:

```powershell
node --test tests/clerk-workspace.test.mjs tests/workspace-ux-regression.test.mjs tests/local-admin-runtime-browser.test.mjs
```

Expected: FAIL because the old flat launcher and oversized utility strip styles remain.

- [ ] **Step 3: Replace the shell styles**

Before editing CSS, read the `ui-ux-pro-max` skill and apply its selected
PALIS × Win95 direction without changing the approved tokens below.

Implement these fixed tokens and state rules:

```css
.clerk-desktop {
  --win-face: #c0c0c0;
  --win-light: #ffffff;
  --win-shadow: #808080;
  --win-dark: #000000;
  --win-active: #000080;
  --win-inactive: #7f7f7f;
  --desktop-teal: #0b5555;
  color: #fff;
  background: var(--desktop-teal);
}

.clerk-desktop__accessible-title {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.clerk-desktop__icons {
  top: 12px;
  left: 10px;
  display: grid;
  grid-auto-flow: column;
  grid-template-rows: repeat(6, 76px);
  grid-auto-columns: 88px;
  gap: 4px 8px;
}

.clerk-desktop__icons button {
  min-width: 72px;
  min-height: 72px;
  padding: 4px;
  border: 0;
  background: transparent;
  color: #fff;
}

.clerk-desktop__icons button.is-selected {
  outline: 1px dotted #fff;
  outline-offset: -3px;
  background: #000080;
}

.clerk-desktop__icon {
  display: grid;
  width: 32px;
  height: 32px;
  margin-inline: auto;
  place-items: center;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.clerk-desktop__icon::before,
.clerk-desktop__icon::after {
  display: none;
  content: none;
}

.clerk-desktop__icon img,
.archive-task-button > img {
  width: 32px;
  height: 32px;
  object-fit: contain;
  image-rendering: pixelated;
}

.archive-task-button > img {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
}

.clerk-desktop__watermark {
  position: absolute;
  right: 18px;
  bottom: 56px;
  display: grid;
  justify-items: end;
  color: rgba(255, 255, 255, .54);
  font: 11px/1.35 "IBM Plex Mono", monospace;
  letter-spacing: .08em;
  pointer-events: none;
}

.clerk-desktop__tray {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 6px;
  border: 2px inset var(--win-light);
  color: #000;
}

.clerk-desktop__start-menu {
  position: absolute;
  z-index: 110;
  bottom: 38px;
  left: 2px;
  display: grid;
  grid-template-columns: 28px minmax(210px, 1fr);
  padding: 2px;
  border: 2px outset var(--win-light);
  background: var(--win-face);
  color: #000;
}

.clerk-desktop__taskbar {
  min-height: 38px;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 3px;
  padding: 3px;
  border-top: 2px outset var(--win-light);
  background: var(--win-face);
}

.archive-workflow-window {
  border: 2px outset #fff;
  background: #c0c0c0;
  box-shadow: 3px 3px 0 rgba(0, 0, 0, .45);
}

.archive-workflow-titlebar__icon {
  width: 16px;
  height: 16px;
  margin-right: 5px;
  image-rendering: pixelated;
  vertical-align: middle;
}

.archive-workflow-window.is-maximized,
.archive-workflow-window.is-narrow-forced,
#clerk-desktop #assistant-window-layer .mascot-document-window.is-maximized,
#clerk-desktop #assistant-window-layer .mascot-document-window.is-narrow-forced {
  inset: 0 !important;
  width: auto !important;
  height: auto !important;
  max-width: none;
  max-height: none;
  box-shadow: none;
}

.archive-workflow-window.is-active .archive-workflow-titlebar { background: #000080; }
.archive-workflow-window:not(.is-active) .archive-workflow-titlebar { background: #7f7f7f; }

.archive-cabinet__menubar {
  display: flex;
  gap: 2px;
  border-bottom: 1px solid #808080;
}

.archive-cabinet__menubar details { position: relative; }
.archive-cabinet__menubar summary {
  padding: 4px 9px;
  color: #000;
  list-style: none;
  cursor: default;
}
.archive-cabinet__menubar details[open] > summary {
  color: #fff;
  background: #000080;
}
.archive-cabinet__menubar [role='menu'] {
  position: absolute;
  z-index: 6;
  top: 100%;
  left: 0;
  min-width: 148px;
  padding: 2px;
  border: 2px outset #fff;
  background: #c0c0c0;
}
.archive-cabinet__menubar [role='menu'] button {
  display: block;
  width: 100%;
  min-height: 28px;
  border: 0;
  text-align: left;
}

.workspace-exit-dialog,
.workspace-sync-dialog {
  width: min(440px, calc(100vw - 24px));
  padding: 3px;
  border: 2px outset #fff;
  color: #000;
  background: var(--win-face);
  box-shadow: 5px 5px 0 rgba(0, 0, 0, .48);
}

.workspace-exit-dialog::backdrop,
.workspace-sync-dialog::backdrop {
  background: rgba(0, 0, 0, .34);
}
```

Delete the obsolete `.clerk-desktop__identity`,
`.clerk-desktop__utilities`, `.clerk-desktop__status`,
`.clerk-desktop__channel`, and `.clerk-desktop__exit` blocks, including their
media-query copies, instead of overriding them. Because `workspace.css` loads
after `style.css`, also delete every shell-owned
`.clerk-desktop__icons`, `.clerk-desktop__icon`,
`.clerk-desktop__utilities`, and `.clerk-desktop__welcome` selector (including
the ≤1100px/≤760px copies) from `workspace.css`; that file may style only
workflow/cabinet/editor client windows. Then use these narrow-screen rules:

```css
@media (max-width: 760px) {
  .clerk-desktop__icons {
    inset: 8px 8px auto;
    grid-auto-flow: row;
    grid-template-columns: repeat(3, minmax(72px, 1fr));
    grid-template-rows: none;
    grid-auto-columns: auto;
    gap: 8px;
  }

  .clerk-desktop__start-menu {
    right: 0;
    bottom: calc(44px + env(safe-area-inset-bottom));
    width: auto;
    grid-template-columns: 28px minmax(0, 1fr);
  }

  .clerk-desktop__taskbar {
    min-height: calc(44px + env(safe-area-inset-bottom));
    padding-bottom: env(safe-area-inset-bottom);
  }

  .clerk-desktop__window-layer {
    bottom: calc(44px + env(safe-area-inset-bottom));
  }

  #clerk-desktop .archive-workflow-window,
  #clerk-desktop #assistant-window-layer .mascot-document-window {
    inset: 0 !important;
    width: auto !important;
    height: auto !important;
    max-width: none;
    max-height: none;
  }

  #clerk-desktop .window-controls button,
  .clerk-desktop__start,
  .clerk-desktop__tray button {
    min-width: 44px;
    min-height: 44px;
  }

  #clerk-desktop [data-workflow-maximize],
  #clerk-desktop .mascot-document-maximize {
    display: none;
  }
}
```

Add a comparison-only `publicOnly` option to
`scripts/compare-palis-baseline.mjs`. Capture and validate the complete
39-scene manifest as before, but when `publicOnly === true`, skip only
`clerk-workspace` and `admin-workspace` in the pixel-comparison loop. Add CLI
flag `--public-only`. Export and use:

```js
const WORKSPACE_SCENES = new Set(['clerk-workspace', 'admin-workspace']);
export const shouldCompareCapture = (capture, { publicOnly = false } = {}) =>
  !publicOnly || !WORKSPACE_SCENES.has(capture.scene);
```

Add a harness test that reads the checked-in baseline manifest, asserts the
filter keeps exactly 33 captures, keeps `clean-home`, and excludes both
workspace scenes. Retain the existing one-pixel comparison test as proof that
a changed included/public capture still fails. This proves the public PALIS
viewer is unchanged without pretending the intentionally redesigned
workspaces match their old baseline.

- [ ] **Step 4: Run targeted tests, full tests, production build, and captures**

Run:

```powershell
node --test tests/clerk-workspace.test.mjs tests/workspace-ux-regression.test.mjs tests/local-admin-runtime-browser.test.mjs
npm test
npm run build
npm run verify:baseline -- --public-only
$env:PALIS_CAPTURE_UI='1'
node --test tests/local-admin-runtime-browser.test.mjs
Remove-Item Env:PALIS_CAPTURE_UI
```

Expected: all tests PASS, Vite production build exits with code 0, the 33
public-only baseline comparisons pass, and `tmp/ui-check/win95-shell/`
contains one desktop capture for each viewport.

- [ ] **Step 5: Run UI Checker and correct material findings**

Read the `ui-checker` skill completely, then inspect the three generated
screenshots plus the keyboard Start-menu and maximize paths. Fix every
high/medium finding that violates this plan, rerun Step 4, and record any
accepted low-severity exception in the implementation handoff.

- [ ] **Step 6: Commit the verified Win95 shell**

```powershell
git add -- scripts/compare-palis-baseline.mjs src/style.css src/archive-workflow/workspace.css tests/clerk-workspace.test.mjs tests/palis-baseline-harness.test.mjs tests/workspace-ux-regression.test.mjs tests/local-admin-runtime-browser.test.mjs
git commit -m "style: complete Win95 workspace shell"
```
