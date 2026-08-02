# PALIS × Win95 Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变 PALIS 首页与九类档案排版的前提下，把管理员和书记官工作台统一为可访问、可响应的 PALIS × Win95 桌面外壳。

**Architecture:** 业务表单继续留在 `workspace.js/workspace.css`，新增四个原生模块分别负责工作台 shell、角色菜单、窗口状态机和危险确认。桌面图标、开始菜单与任务栏只转发统一 action ID，不复制权限或仓储逻辑。新增外壳 CSS 完全作用域化在 `#clerk-desktop` 内。

**Tech Stack:** 原生 ES modules、HTML/CSS、Node `node:test`、Puppeteer Core、C00 浏览器基线工具。

## Global Constraints

- 实施必须遵循 `docs/superpowers/specs/2026-07-28-palis-win95-workspace-design.md`。
- 保留 PALIS 深色桌面、红/黄/青登记标、现有字体、SVG、纸张排版和九类动效。
- 不改变 `#experience`、九类 `data-mode`、`src/archive-data.js` 或 `public/templates/01–09` 的内容。
- 不引入 React、Tailwind、Radix、Base UI、外部字体或远程图片。
- 书记官的科考站 `03`、白幕入口 `04` 仍为 amendment-only。
- 管理员入口即使通过脚本直接调用，也必须重新经过权限校验。
- 移动端触控目标 ≥44×44px，输入字号 ≥16px，四边 safe-area 生效。
- 新增过渡只用 opacity/transform，≤200ms，并支持 reduced-motion。
- JS gzip 增量 ≤8KB，CSS gzip 增量 ≤6KB。
- 每个代码步骤先写真实失败测试；完成后使用 `ui-checker` 逐项复核。
- `ui-ux-pro-max` 只用于核对已批准的信息层级和交互，不生成新主题。

---

### Task 1: C06.1 工作台隔离基线与 action registry

**Files:**
- Create: `src/archive-workflow/workspace-role-config.js`
- Create: `tests/workspace-role-config.test.mjs`
- Create: `tests/workspace-shell-scope.test.mjs`
- Modify: `src/archive-workflow/workspace.js`

**Interfaces:**
- Produces: `WORKSPACE_ACTIONS`
- Produces: `workspaceActionsForRole(role) -> readonly action[]`
- Produces: `workspacePolicyFor(role, actionId) -> {kind,enabled}`
- Produces: `canDispatchWorkspaceAction(role, actionId, templatePolicies) -> boolean`

- [ ] **Step 1: 写角色 action RED**

固定 action ID：

```js
[
  'workspace:welcome',
  'template:01', 'template:02', 'template:03', 'template:04',
  'template:05', 'template:06', 'template:07', 'template:08', 'template:09',
  'panel:drafts', 'panel:inbox',
  'panel:review', 'panel:users', 'panel:archives',
  'workspace:exit',
]
```

测试：

```js
assert.equal(canDispatchWorkspaceAction('clerk', 'panel:review'), false);
assert.equal(canDispatchWorkspaceAction('admin', 'panel:review'), true);
assert.equal(workspacePolicyFor('clerk', 'template:03').kind, 'amendment');
assert.equal(workspacePolicyFor('admin', 'template:03').kind, 'new-or-amendment');
```

Run: `node --test tests/workspace-role-config.test.mjs`

Expected: FAIL，模块不存在。

- [ ] **Step 2: 实现纯角色配置**

文件只保存 action 元数据、菜单顺序和展示组；最终权限仍调用现有 `canEnterWorkspace/canReview`。不得 import DOM、repository 或 Supabase。

- [ ] **Step 3: 写隔离哈希与 selector RED**

测试冻结：

- `<main id="experience">` 静态片段 hash。
- `public/templates/01–09` 九份文件 hash。
- `src/archive-data.js` hash。
- 九类目录 ID、mode 与 `01–09` 顺序。

另读取未来 `workspace-shell.css`，禁止出现：

```text
#folder-orbit
.folder-button
.archive-layer
.polar-layer
.mode-
```

禁止无 `#clerk-desktop` 前缀的全局 `button/input/select/.title-bar` selector。

- [ ] **Step 4: 建立唯一 action dispatcher**

`workspace.js` 导出或在初始化结果暴露：

```js
dispatchWorkspaceAction(actionId, trigger)
```

桌面图标和现有 `[data-workflow-panel]` 先接到 dispatcher，但保持原视觉和原 ID。无权限 action 返回 `{ok:false,code:"permission_denied"}`，不得打开窗口。

- [ ] **Step 5: 验证并提交**

Run:

```text
node --test tests/workspace-role-config.test.mjs tests/workspace-shell-scope.test.mjs tests/clerk-workspace.test.mjs
npm test
```

Commit: `refactor: centralize workspace actions and roles`

---

### Task 2: C06.2 工作台 shell 与角色化开始菜单

**Files:**
- Create: `src/archive-workflow/workspace-shell.js`
- Create: `tests/workspace-shell.test.mjs`
- Modify: `index.html`
- Modify: `src/main.js`
- Modify: `src/archive-workflow/workspace.js`

**Interfaces:**
- Produces: `createWorkspaceShell({root,entry,startButton,exitButton,dispatch,getSession})`
- Shell: `{open,close,setRole,setMenuOpen,destroy}`

- [ ] **Step 1: 写 shell 状态 RED**

使用最小 DOM fixture 断言：

```js
shell.open();
assert.equal(root.hidden, false);
assert.equal(document.body.classList.contains('clerk-desktop-open'), true);
assert.equal(experience.inert, true);
shell.close();
assert.equal(document.activeElement, entry);
```

observer 调用 `open()` 必须返回 `permission_denied` 并保持 hidden。

Run: `node --test tests/workspace-shell.test.mjs`

Expected: FAIL，模块不存在。

- [ ] **Step 2: 抽取现有工作台开关**

把 `main.js` 的工作台 open/close、inert、焦点归还和 Escape 生命周期移入 shell。保留：

- `#clerk-workspace-entry`
- `#clerk-desktop`
- `#clerk-desktop-start`
- `#clerk-desktop-exit`
- `#assistant-window-layer`
- `#assistant-taskbar`

`main.js` 只负责创建 shell 并传入 dispatcher/session provider。

- [ ] **Step 3: 写开始菜单 RED**

在 `#clerk-desktop` 内新增 `#workspace-start-menu`，但测试先要求：

```js
startButton.click();
assert.equal(startButton.getAttribute('aria-expanded'), 'true');
assert.equal(menu.hidden, false);
pressEscape();
assert.equal(menu.hidden, true);
assert.equal(document.activeElement, startButton);
```

clerk 菜单不含 `panel:review/users/archives`；admin 菜单包含。九类菜单项全部存在但不加载 iframe。

- [ ] **Step 4: 实现角色化开始菜单**

菜单固定三组：

1. 身份与欢迎。
2. 九类档案子菜单 `template:01–09`。
3. 当前角色可用的工作流工具。

底部固定 `workspace:exit`。所有 `[data-workspace-menu-action]` 调用与桌面图标相同 dispatcher。点击菜单外、再次点击开始、Escape 或退出都关闭菜单。

原欢迎窗改为 `workspace:welcome` 菜单项；`#clerk-desktop-start` 不再直接打开欢迎窗。

- [ ] **Step 5: 键盘与焦点约束**

工作台作为 modal 打开时：

- 首焦点进入 shell 标题或首个 action。
- Tab/Shift+Tab 在工作台内循环，不逃到 `#experience`。
- Escape 顺序：alertdialog → 开始菜单 → 当前非阻塞窗口。
- 退出后焦点回 `#clerk-workspace-entry`。
- 不使用正数 `tabindex`。

- [ ] **Step 6: 验证并提交**

Run:

```text
node --test tests/workspace-shell.test.mjs tests/clerk-workspace.test.mjs
npm test
```

Commit: `feat: add role-aware PALIS start menu`

---

### Task 3: C06.3 统一窗口状态机与任务栏

**Files:**
- Create: `src/archive-workflow/workspace-window-manager.js`
- Create: `tests/workspace-window-manager.test.mjs`
- Modify: `src/archive-workflow/workspace.js`
- Modify: `src/main.js`

**Interfaces:**
- Produces: `createWorkspaceWindowManager({root,layer,taskList,reducedMotion,isMobile})`
- Manager: `{open,focus,minimize,restore,toggleMaximize,close,list,destroy}`
- Window state: `{key,element,taskButton,minimized,maximized,restoreRect,trigger,dirty}`

- [ ] **Step 1: 写窗口生命周期 RED**

```js
const first = manager.open({ key: 'drafts', trigger, render });
const again = manager.open({ key: 'drafts', trigger, render });
assert.equal(again, first);
manager.minimize(first);
assert.equal(first.element.hidden, true);
manager.restore(first);
assert.equal(first.element.hidden, false);
```

任务按钮行为：

- active → minimize。
- inactive → focus/置顶。
- minimized → restore/置顶。

Run: `node --test tests/workspace-window-manager.test.mjs`

Expected: FAIL，模块不存在。

- [ ] **Step 2: 实现窗口状态与内部层级**

只在工作台内部使用五档：

```text
desktop 0
window 1000 + sequence
taskbar 4000
start-menu 4100
blocking-dialog 5000
```

动态窗口必须有唯一 `aria-labelledby`、`tabindex="-1"` 和 trigger 引用。focus 同时更新活动标题栏、task `aria-pressed` 和真实 DOM focus。

- [ ] **Step 3: 实现控制按钮**

每个工作流窗口拥有：

- `[data-workflow-minimize]`
- `[data-workflow-maximize]`（仅桌面）
- `[data-workflow-close]`

最大化保存/恢复上次 rect；移动端隐藏最大化且禁止拖动。关闭 dirty 窗口调用 Task 4 的 confirm provider；关闭成功后焦点返回原 trigger。

- [ ] **Step 4: 替换重复窗口实现**

把 `workspace.js` 的 `focusWindow/createWindow/toggleMinimize` 与 `main.js` 的工作台文档窗口状态统一迁入 manager。业务 render 函数不移动到 manager。

- [ ] **Step 5: 验证并提交**

Run:

```text
node --test tests/workspace-window-manager.test.mjs tests/workspace-ux-regression.test.mjs
npm test
```

Commit: `refactor: unify PALIS workspace windows`

---

### Task 4: C06.4 危险确认、加载和错误反馈

**Files:**
- Create: `src/archive-workflow/workspace-alert-dialog.js`
- Create: `tests/workspace-alert-dialog.test.mjs`
- Modify: `src/archive-workflow/workspace.js`

**Interfaces:**
- Produces: `confirmWorkspaceAction({title,description,confirmLabel,danger,trigger}) -> Promise<boolean>`
- Produces: `setFieldError(control,messageElement,message)`

- [ ] **Step 1: 写 alertdialog RED**

```js
const pending = confirmWorkspaceAction({
  title: '永久删除档案',
  description: '输入编号后仍不可恢复',
  confirmLabel: '确认永久删除',
  danger: true,
  trigger,
});
assert.equal(dialog.getAttribute('role'), 'alertdialog');
assert.equal(document.activeElement, cancelButton);
pressEscape();
assert.equal(await pending, false);
assert.equal(document.activeElement, trigger);
```

Tab 不得逃出 dialog。

Run: `node --test tests/workspace-alert-dialog.test.mjs`

Expected: FAIL，模块不存在。

- [ ] **Step 2: 实现共享确认窗**

使用 PALIS 现有颜色/token 和 Win95 chrome；提供可访问标题/说明、取消/确认两个按钮。danger 只改变小面积状态标，不以颜色作为唯一提示。

- [ ] **Step 3: 替换危险动作**

替换账号删除的 `window.confirm()` 与永久删档确认。永久删档仍要求输入完整档案编号；确认窗不得绕过该字段校验。

- [ ] **Step 4: 统一状态语义**

- 请求状态使用邻近 `role="status"` 或 `aria-live="polite"`。
- 当前动作按钮 disabled，并保留原文案。
- 字段错误设置 `aria-invalid="true"` 与 `aria-describedby`。
- 失败保留表单内容并提供重试。
- 权限变化关闭已失权管理窗，不执行隐藏动作。

- [ ] **Step 5: 验证并提交**

Run:

```text
node --test tests/workspace-alert-dialog.test.mjs tests/clerk-workflow-ui.test.mjs
npm test
```

Commit: `feat: add accessible PALIS confirmations`

---

### Task 5: C06.5 作用域化 Win95 外壳与响应式

**Files:**
- Create: `src/archive-workflow/workspace-shell.css`
- Modify: `src/main.js` or workspace shell entry to import CSS
- Modify: `src/style.css` only to remove superseded workbench-only rules after selector parity tests
- Modify: `src/archive-workflow/workspace.css` only for mobile form controls
- Modify: `tests/workspace-shell-scope.test.mjs`

- [ ] **Step 1: 写 CSS scope RED**

测试要求所有 shell rule 以 `#clerk-desktop` 或 `body.clerk-desktop-open #clerk-desktop` 开头，且禁止九类目录 selector。

Run: `node --test tests/workspace-shell-scope.test.mjs`

Expected: FAIL，CSS 不存在。

- [ ] **Step 2: 实现 PALIS × Win95 token**

只引用现有 `--clerk-*`、`--win-*`、`--cold-*` 和字体 token：

- 2px outset/inset 灰边。
- active 深海军蓝标题栏，inactive 中灰。
- 直角窗口按钮与按下内凹。
- 蓝色图标选中底、点状 `:focus-visible`。
- 固定任务栏、开始按钮、任务区、身份状态、返回和时钟。

不得新增全局主题变量、渐变体系、阴影体系或远程资源。

- [ ] **Step 3: 实现三 viewport**

`1440×900`：

- 九类入口全部可扫描。
- 欢迎窗不覆盖全部入口。
- 两窗口活动/非活动状态可见。
- 拖动、最大化、最小化、恢复可用。

`390×844`：

- 九类入口 2–3 列。
- 所有交互目标 ≥44px，输入高度 ≥44px、字号 ≥16px。
- 工作流窗占任务栏上方区域。
- 任务按钮区可横向滚动，无页面级横向滚动。

`844×390`：

- 禁止拖动/最大化。
- 图标、工具和菜单可纵向滚动。
- 开始、退出、时钟始终可达。

四边使用 `safe-area-inset-*`，新增高度使用 `dvh`，不新增 `vh`。

- [ ] **Step 4: reduced-motion 与动画预算**

新增过渡只使用 opacity/transform，≤200ms。`prefers-reduced-motion: reduce` 立即完成状态变化。工作台关闭时不得新增 interval、RAF loop 或 `will-change` 常驻。

- [ ] **Step 5: 验证并提交**

Run:

```text
node --test tests/workspace-shell-scope.test.mjs
npm test
npm run build
```

Commit: `style: apply scoped PALIS Win95 workspace shell`

---

### Task 6: C06.6 浏览器、视觉、技能与性能验收

**Files:**
- Create: `tests/workspace-shell-browser.test.mjs`
- Modify: `docs/reports/2026-07-28-PALIS档案管理系统实施报告-v0.2.md`
- Modify: `docs/reports/2026-07-28-PALIS档案管理系统验收报告-v0.2.md`

- [ ] **Step 1: 写三 viewport 浏览器矩阵**

覆盖：

| Control | Required result |
|---|---|
| workspace entry | clerk/admin 打开；observer 拒绝；退出焦点返回 |
| start | 切换菜单；Escape 关闭并回焦点 |
| desktop 01–09 | 单击打开；重复点击只激活 |
| keyboard 01–09 | focus 不打开；Enter/Space 打开 |
| admin panels | clerk 不可见、不可聚焦、直接 dispatch 也拒绝 |
| minimize/maximize/close | 状态与 `aria-pressed` 同步；关闭回 trigger |
| task buttons | active 最小化、inactive 置顶、minimized 恢复 |
| exit | 不清草稿，只关闭工作台 |
| alertdialog | 初焦点取消；Tab 不逃逸；Escape 取消 |

- [ ] **Step 2: 九类目录隔离比较**

每类记录：

- `data-category`
- `data-mode`
- `#folder-orbit` class
- 条目数量与 bounding rect
- scroll position
- 稳定区域 screenshot

打开管理员工作台再退出，重新记录。DOM/几何必须相同，稳定区域像素差 ≤0.5%。

- [ ] **Step 3: 执行 `ui-checker`**

逐项记录并修复：

- focus trap/return。
- icon-only aria-label。
- 44px/16px。
- safe-area 与横屏。
- loading/error/empty/disabled。
- z-index 与嵌套滚动。
- reduced-motion 与离屏循环。

重新跑相关浏览器测试证明修复。

- [ ] **Step 4: 执行 `ui-ux-pro-max` 约束复核**

只核验批准方案：

- 信息层级保持“九类入口 → 工具 → 窗口/任务栏”。
- 没有现代 SaaS 侧栏、卡片仪表盘或新主题。
- 角色差异来自权限，不是复制 UI。
- 开始菜单不预加载 iframe。

- [ ] **Step 5: 性能与全量验证**

对比 C00 baseline build：

- JS gzip 增量 ≤8KB。
- CSS gzip 增量 ≤6KB。
- 新增外部请求 0。
- 新增字体/图片 0。
- 新增长驻 timer/RAF 0。

Run:

```text
node --test tests/workspace-shell-browser.test.mjs
npm test
npm run build
npm run verify:baseline
```

Expected: 全部 exit 0。

- [ ] **Step 6: 更新报告并提交**

实施报告写入实际文件、测试计数和体积差；验收报告只有所有硬条件通过才标记 C06 通过。

Commit: `feat: complete PALIS Win95 workspace shell`
