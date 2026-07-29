# PALIS 工作台共享便签条实施计划

> **实施方式：** 使用 `subagent-driven-development`，每个任务先写失败测试、实现、复核、再进入下一任务。本文以已确认的 [便签条设计规格](../specs/2026-07-29-workspace-sticky-notes-design.md) 为唯一产品依据。

## 目标与边界

- 取代右侧欢迎说明窗；默认没有任何便签，右侧保持干净。
- 管理员可自由新增任意多张、编辑标题和内容、删除任意一张。
- 书记官只读，可拖动，可在本次打开桌面期间关闭单张；不能新增、编辑或删除。
- 便签内容在 Supabase 正式模式下跨账号共享；位置以 `(note_id, profile_id)` 按账号长期保存；LOCAL 只模拟单机多账号。
- 正常窗口仍使用既有 `window-unfold` / minimize / restore / close 动画；书记官关闭便签、管理员删除便签使用专属“撕下”离场动画。
- 不改变档案草稿、审核、打回、正式录入、发布、编号、版本与署名状态机。

## Task 1：建立云端便签表、RLS 与仓储合同

**文件：**

- 新增：`supabase/migrations/202607290005_workspace_sticky_notes.sql`
- 修改：`src/archive-workflow/repository-contract.js`
- 修改：`src/archive-workflow/repositories/supabase-repository.js`
- 修改：`tests/archive-workflow-schema.test.mjs`
- 修改：`tests/archive-workflow-repository-contract.test.mjs`
- 修改：`tests/archive-workflow-repository-shapes.test.mjs`
- 修改：`tests/archive-workflow-client.test.mjs`

**接口：**

```js
listWorkspaceNotes() => Promise<WorkspaceNote[]>;
createWorkspaceNote({ title, content, sortOrder }) => Promise<WorkspaceNote>;
updateWorkspaceNote(id, { title, content, sortOrder }) => Promise<WorkspaceNote>;
deleteWorkspaceNote(id) => Promise<{ id }>;
listWorkspaceNoteLayouts(profileId) => Promise<WorkspaceNoteLayout[]>;
saveWorkspaceNoteLayout({ noteId, profileId, leftPx, topPx }) => Promise<WorkspaceNoteLayout>;
```

`WorkspaceNote` 必须至少返回 `id,title,content,sort_order,created_by,created_at,updated_at`；`WorkspaceNoteLayout` 必须至少返回 `note_id,profile_id,left_px,top_px,updated_at`。

### Step 1：写失败的 schema、合同和 Supabase 请求测试

- 测试新迁移创建 `workspace_notes` 与 `workspace_note_layouts`，包含非空标题/正文、非负顺序/坐标、复合主键、级联删除、更新时间触发器和 profile 布局索引。
- 测试 RLS：启用的 admin/clerk 可读取内容；仅 admin 可创建/修改/删除内容；布局只允许启用 admin/clerk 读取和写入自己的 `profile_id`；禁用用户、observer、anon 均无权限；管理员不能覆写其他账号布局。
- 在仓储合同完整 stub 中加入六个方法，并验证不完整实现会被拒绝。
- mock Supabase 请求，断言：便签按 `sort_order,created_at,id` 排序；标题/正文 trim 后不能为空；只白名单写入 title/content/sort_order；布局按 `profile_id` 过滤并以 `note_id,profile_id` upsert；删除返回明确 id。

### Step 2：运行并确认红灯

运行：

```powershell
node --test tests/archive-workflow-schema.test.mjs tests/archive-workflow-repository-contract.test.mjs tests/archive-workflow-repository-shapes.test.mjs tests/archive-workflow-client.test.mjs
```

预期：新表、六个方法和请求形状尚不存在。

### Step 3：最小实现迁移和 Supabase 仓储

- 写 migration `202607290005`：建表、trigger、索引、RLS、grant/revoke 与辅助权限函数；沿用已有 migration 的 `is_admin()` / `set_updated_at()` 安全模式，函数使用 `security definer set search_path = public`。
- `created_by`/`created_at` 在更新时不可被客户端改写；插入必须符合 `created_by = auth.uid()`。
- 不增加 note RPC；每次 mutation 都是单行 PostgREST 请求并由 RLS 做最终授权。
- 扩展合同验证和 Supabase repository，所有文本先 trim，布局坐标只接受有限的非负整数。

### Step 4：运行测试和提交

运行上面的 suite；预期全绿。提交：

```powershell
git add supabase/migrations/202607290005_workspace_sticky_notes.sql src/archive-workflow/repository-contract.js src/archive-workflow/repositories/supabase-repository.js tests/archive-workflow-schema.test.mjs tests/archive-workflow-repository-contract.test.mjs tests/archive-workflow-repository-shapes.test.mjs tests/archive-workflow-client.test.mjs
git commit -m "feat: add shared workspace note repository"
```

## Task 2：让 LOCAL 状态和旧快照兼容便签

**文件：**

- 修改：`src/archive-workflow/local/local-state.js`
- 修改：`src/archive-workflow/local/local-workflow-engine.js`
- 修改：`src/archive-workflow/local/local-snapshot-codec.js`
- 修改：`src/archive-workflow/repositories/local-indexeddb-repository.js`
- 修改：`tests/local-workflow-engine.test.mjs`
- 修改：`tests/local-indexeddb-browser.test.mjs`

### Step 1：写失败的本地权限、布局隔离与旧状态迁移测试

- admin 可 CRUD 共享便签；clerk 只读；observer/disabled 被拒；所有返回值均为深拷贝。
- 两个 profile 对同一 note 保存不同位置，不能互相读写；删除 note 会清理所有布局。
- 坐标、标题、正文、顺序的非法值被拒绝。
- 旧的 IndexedDB state/snapshot 缺少新数组时，保留原有档案和草稿，并安全补入空的 `workspaceNotes` / `workspaceNoteLayouts`；导出格式升级后仍能读入有效 v1 快照。

### Step 2：确认红灯

运行：

```powershell
node --test tests/local-workflow-engine.test.mjs tests/local-indexeddb-browser.test.mjs
```

### Step 3：实现 LOCAL 数据面

- 在默认 state 添加两个数组，在 engine 公开六个与云端同名的方法。
- 所有读取和 mutation 复用 `readSnapshot` / transaction；内容 mutation 只允许 admin；布局的 requested profile 必须严格等于当前 principal id，即使当前账号是 admin 也不得替别人保存布局。
- 本地 repository 在验证之前规范化旧 state；不要改 IndexedDB 数据库名或抛弃既有档案数据。
- snapshot codec 接受并升级旧有效 snapshot，再输出新 schema；无效 checksum/shape 仍拒绝。

### Step 4：验证并提交

运行 Task 2 suite 和 Task 1 相关测试；提交：

```powershell
git add src/archive-workflow/local/local-state.js src/archive-workflow/local/local-workflow-engine.js src/archive-workflow/local/local-snapshot-codec.js src/archive-workflow/repositories/local-indexeddb-repository.js tests/local-workflow-engine.test.mjs tests/local-indexeddb-browser.test.mjs
git commit -m "feat: persist workspace notes in local runtime"
```

## Task 3：定义独立的便签控制器与纯交互规则

**文件：**

- 新增：`src/archive-workflow/workspace-notes.js`
- 新增：`tests/workspace-sticky-notes.test.mjs`

### Step 1：写失败的纯函数/控制器测试

覆盖：

- `canManageWorkspaceNotes(role)` 仅 admin 为 true；clerk 只读。
- 默认位置从右侧纵向堆叠；空间不足时按列向左继续，避免无界重叠；有 saved layout 时优先使用。
- 拖动坐标在 window layer 内 clamp；resize 只视觉重 clamp，不覆盖宽屏保存值；坐标 round 后才请求保存。
- 关闭仅写 session Set，desktop closed→open 时 Set 清空。
- 关闭/删除的 tear 状态、reduced motion 的立即完成、失败时还原状态。
- 异步 load generation：账号/桌面 scope 改变后，旧请求不能写入当前账号视图。

### Step 2：确认红灯

运行：

```powershell
node --test tests/workspace-sticky-notes.test.mjs
```

### Step 3：实现控制器但暂不连接真实桌面

- 仅在新模块中实现纯 helpers 和 `initializeWorkspaceNotes({ client, root, initialSession })`。
- 便签数据必须经 DOM API `textContent` 渲染，不能把管理员输入拼进 `innerHTML`。
- controller 保存 profile/role、load generation、notes、layouts、session close Set、pending operation 和 editing drafts；所有 create/update/delete 错误保留用户输入。
- 拖动使用 pointer capture，开始时捕获 note/profile id，pointerup/cancel 时才保存；保存失败保留视觉位置并显示可重试错误。
- 本任务不改 `main.js`、HTML 或 CSS，因此 controller 可用 mock root/client 完整测试。

### Step 4：验证并提交

```powershell
node --test tests/workspace-sticky-notes.test.mjs
git add src/archive-workflow/workspace-notes.js tests/workspace-sticky-notes.test.mjs
git commit -m "feat: add workspace note controller"
```

## Task 4：将便签接入桌面、账号会话与管理员/书记官界面

**文件：**

- 修改：`index.html`
- 修改：`src/main.js`
- 修改：`tests/clerk-workspace.test.mjs`
- 修改：`tests/local-admin-runtime-browser.test.mjs`

### Step 1：写失败的桌面权限/生命周期测试

- 右侧欢迎内容初始不再显示，桌面有独立 note region、状态/retry 区和仅管理员可见的“新增便签”入口。
- `setDesktopOpen(true/false)` 发出明确的 desktop lifecycle event；每次重新打开会清空 session-close Set 并重新加载共享便签和当前 profile 的布局。
- `palis:session-change` 或 role/profile 切换关闭/清空旧 scope；旧账号异步响应不能短暂展示到新账号。
- admin 看见新增/编辑/删除 controls；clerk 只看到正文/拖动/关闭；管理员入口和档案入口保持不变。

### Step 2：确认红灯

运行：

```powershell
node --test tests/clerk-workspace.test.mjs tests/local-admin-runtime-browser.test.mjs tests/workspace-sticky-notes.test.mjs
```

### Step 3：接线 desktop shell

- 将 repository 在 `initializeMascotAssistant` 之前可用地传给 notes controller；controller 监听 initial session 和后续 session events。
- 取代右侧初始 welcome panel 为 notes region；保留 Start menu 的“关于工作台”入口为隐藏的 About dialog，更新所有已删除 welcome DOM 引用。
- desktop 每次 open 与页面重新获得可见性时 reload；失败仅显示不阻断档案操作的 retry 状态。
- controller 只占 notes layer 的 pointer events；空 layer 绝不挡住 archive/workspace windows。

### Step 4：验证并提交

运行 Task 4 suite；提交：

```powershell
git add index.html src/main.js tests/clerk-workspace.test.mjs tests/local-admin-runtime-browser.test.mjs
git commit -m "feat: mount shared notes on workspace desktop"
```

## Task 5：完成纸质便签视觉、撕下动效和跨账号浏览器流程

**文件：**

- 修改：`src/style.css`
- 修改：`src/archive-workflow/workspace-notes.js`
- 修改：`tests/workspace-sticky-notes.test.mjs`
- 新增或修改：`tests/workspace-sticky-notes-browser.test.mjs`

### Step 1：写失败的视觉/行为测试

- cards 为纸质便签条，而非 `.archive-window` / `.mascot-document-window`；正常窗口没有新增 keyframe。
- note close 用 `.is-tearing` / 专属 tear keyframe；respect `prefers-reduced-motion`；结束后才 session-hide。
- admin delete 在 tear 后调用删除；保存失败时移除 tear state、还原 note 和输入；编辑/新增失败保持 draft。
- browser flow：空默认、admin 创建多张/编辑/删除、clerk read-only、clerk close 到下一次 desktop open 恢复、两个 profile 位置隔离、边界 drag、load retry、动画关闭和 reduced motion。

### Step 2：确认红灯

运行：

```powershell
node --test tests/workspace-sticky-notes.test.mjs tests/workspace-sticky-notes-browser.test.mjs
```

### Step 3：实现最终视觉和动画

- 将 final CSS 放到最后一组 PALIS/Win95 desktop cascade 之后，避免旧 welcome 规则覆写。
- note 用绝对 `left/top` 定位，拖动不要用 transform，以免与 tear transform 动画互相覆盖。
- 默认 stack 使用右侧 gutter，超出高度时向左扩列；窄屏缩小 card 的可视尺寸，但仍可拖动且不越界。
- 普通窗口继续原封不动复用 `window-unfold` / minimize / restore / task-close；便签是唯一拥有 tear keyframe 的对象。
- 所有 icon hit target、键盘焦点、aria-label、error/retry 按钮在窄屏均可访问。

### Step 4：全量便签验证并提交

运行：

```powershell
node --test tests/workspace-sticky-notes.test.mjs tests/workspace-sticky-notes-browser.test.mjs tests/clerk-workspace.test.mjs tests/local-admin-runtime-browser.test.mjs
npm.cmd run build
git add src/style.css src/archive-workflow/workspace-notes.js tests/workspace-sticky-notes.test.mjs tests/workspace-sticky-notes-browser.test.mjs
git commit -m "feat: add draggable shared workspace notes"
```

## Task 6：最终集成与回归基线

**文件：**

- 修改：仅真正需要更新的既有测试、`docs/superpowers/plans/2026-07-29-clerk-native-editor.md` 的 Task 7/8 交接说明
- 修改：`scripts/verify-local-admin.mjs`（仅当原 welcome selector 已被删除）

### Step 1：执行实际端到端流程

在真实 local browser 中验证：书记官新建九类任一档案 → 提交 → 管理员审核/打回 → 书记官在对应新增/修改位置看到原因并重开 → 管理员通过 → 正式编号/版本/署名出现 → 档案系统可见；同时验证 notes 不拦截窗口、关闭/重开行为和账号布局隔离。

### Step 2：有意更新已淘汰的基线

只更新因 iframe 移除、单滚动原生表单、右侧停靠或 welcome 被便签取代而过期的断言；不把未知失败标记为基线。记录每项基线对照和原因。

### Step 3：完整验证与提交

运行：

```powershell
npm.cmd test
npm.cmd run build
```

再做截图/视觉检查：大桌面、窄桌面、reduced motion、空便签、两张以上便签、管理员编辑、书记官只读、撕下动画、右侧原生表单与左侧放大图标。

