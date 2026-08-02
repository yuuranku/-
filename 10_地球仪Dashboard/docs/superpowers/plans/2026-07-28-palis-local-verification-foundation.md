# PALIS Local Verification Foundation Implementation Plan

> **已被替代：** 本计划保留为首稿审查记录，不得执行。可执行版本为 `2026-07-28-palis-local-verification-foundation-v2.md`。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立不需要登录或 Supabase 的本地全权限管理员运行时，并在不改变 PALIS 视觉和现有生产行为的前提下，让本地与 Supabase 工作流共享可验证的仓库合同。

**Architecture:** 保留 `createArchiveWorkflowClient` 作为兼容入口，把 Supabase 实现机械迁入独立 repository；新增显式仓库合同、本地事务核心和 IndexedDB 适配器。`main.js` 通过运行时解析器选择生产 Supabase 或仅限 loopback 开发环境的本地管理员，本地控制面板复用现有 PALIS 窗口与确认样式。

**Tech Stack:** Vite 7、原生 ES modules、Node `node:test`、Puppeteer Core、IndexedDB、Supabase JS、原生 HTML/CSS。

## Global Constraints

- 九类现有排版、PALIS 配色、字体、纹理、光标、窗口、弹窗和动效不得换皮。
- 科考站和白幕入口：书记官只能申请修改；管理员可以新建、修改和设定。
- 新建档案使用九类结构化合同；扩展页和修改页正文从空白页开始。
- 档号、事件编号、提交编号、REV、R、署名、时间和 `VER 0.1 / 白幕初垂` 由系统生成。
- 本地管理员 ID 固定为 `local-admin`，默认拥有全部管理员能力。
- 本地模式不得请求 Supabase、Storage 或 Edge Functions，不得包含 service role key。
- 本地模式只有 `import.meta.env.DEV`、loopback origin 和显式启动标记同时满足时启用。
- 生产构建发现本地管理员入口、验收夹具或失败注入入口时必须失败。
- 不新增 React、Vue、Tailwind 或通用后台组件库。
- 所有 UI 任务必须同时使用 `ui-ux-pro-max` 做设计/交互前置审查，并在完成后使用 `ui-checker` 做逐项复核。
- 两项 UI 技能与项目约束冲突时，以现有原生 Vite/JavaScript、PALIS 视觉冻结和项目既有组件为准；不得为满足技能的通用栈建议引入 Tailwind、React、motion/react、Radix、Base UI 或新主题。
- UI 审查必须覆盖键盘与焦点、icon-only `aria-label`、44×44px 移动触控区域、safe-area、错误就近反馈、loading/disabled 状态、reduced-motion、固定 z-index 层级、横向溢出和长文本。
- 不修改既有已执行 Supabase migration。
- 每项生产代码必须先有一个因目标行为缺失而失败的真实行为测试。
- 每个任务完成后运行聚焦测试；每批完成后运行 `npm test` 和 `npm run build`。
- 未经委托人明确授权，不部署生产。

---

### Task 1: C00 基线测试与可重复截图

**Files:**
- Create: `scripts/palis-browser-runtime.mjs`
- Create: `scripts/capture-palis-baseline.mjs`
- Create: `tests/palis-browser-runtime.test.mjs`
- Create: `docs/verification/palis-baseline-manifest.json`
- Create: `docs/verification/palis-ui-invariants.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: 已安装的 `puppeteer-core` 和本机 Edge。
- Produces: `resolveBrowserExecutable(candidates) -> string`、`parseViewport("1440x900") -> {width,height}`、`npm run verify:baseline`。

- [ ] **Step 1: 写浏览器路径和视口解析的失败测试**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseViewport,
  resolveBrowserExecutable,
} from '../scripts/palis-browser-runtime.mjs';

test('parseViewport rejects malformed or non-positive dimensions', () => {
  assert.deepEqual(parseViewport('1440x900'), { width: 1440, height: 900 });
  assert.throws(() => parseViewport('1440'), /WIDTHxHEIGHT/);
  assert.throws(() => parseViewport('0x900'), /positive/);
});

test('resolveBrowserExecutable returns the first existing candidate', () => {
  const exists = new Set(['C:/Edge/msedge.exe']);
  assert.equal(
    resolveBrowserExecutable(
      ['C:/Chrome/chrome.exe', 'C:/Edge/msedge.exe'],
      (candidate) => exists.has(candidate),
    ),
    'C:/Edge/msedge.exe',
  );
  assert.throws(
    () => resolveBrowserExecutable(['C:/missing.exe'], () => false),
    /No supported browser executable/,
  );
});
```

- [ ] **Step 2: 验证 RED**

Run: `node --test tests/palis-browser-runtime.test.mjs`  
Expected: FAIL，原因是 `scripts/palis-browser-runtime.mjs` 不存在。

- [ ] **Step 3: 实现最小浏览器运行时**

```js
import { existsSync } from 'node:fs';

export const DEFAULT_BROWSER_CANDIDATES = Object.freeze([
  process.env.PALIS_BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean));

export function parseViewport(value) {
  const match = /^(\d+)x(\d+)$/.exec(String(value ?? ''));
  if (!match) throw new TypeError('Viewport must use WIDTHxHEIGHT');
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width <= 0 || height <= 0) throw new RangeError('Viewport dimensions must be positive');
  return { width, height };
}

export function resolveBrowserExecutable(
  candidates = DEFAULT_BROWSER_CANDIDATES,
  fileExists = existsSync,
) {
  const resolved = candidates.find((candidate) => fileExists(candidate));
  if (!resolved) throw new Error('No supported browser executable was found');
  return resolved;
}
```

- [ ] **Step 4: 验证 GREEN**

Run: `node --test tests/palis-browser-runtime.test.mjs`  
Expected: 2 tests PASS。

- [ ] **Step 5: 建立真实浏览器基线脚本**

`capture-palis-baseline.mjs` 必须：

1. 从 `PALIS_BASE_URL` 读取地址，默认 `http://127.0.0.1:4173/`。
2. 在 1440×900 和 390×844 各打开一次公开预览。
3. 等待 `document.fonts.ready` 和首屏稳定。
4. 分别保存首页、九类目录和工作台壳截图到 `tmp/verification/baseline/`。
5. 在工作台壳截图前，仅在当前页面派发一个 `palis:session-change` 的本地管理员视觉事件；不写应用代码或数据库。
6. 采集 CSS token、活动元素、窗口/任务按钮数量和动效 class 到 JSON。
7. 对每个截图计算 SHA-256，写入 manifest。
8. 任何页面错误、控制台 error、缺失入口或截图失败都以非零码退出。

- [ ] **Step 5A: 用 `ui-ux-pro-max` 建立 PALIS UI 不变量**

不选择新风格，只把现有 PALIS 映射到以下审查项并写入 `palis-ui-invariants.md`：

- 现有 `--space`、`--cold-*`、`--win-*`、`--paper*`、`--archive-*`、`--clerk-*` token 是唯一视觉来源。
- 现有 Noto Serif SC、Noto Sans SC、IBM Plex Mono 字体组合保持不变。
- 表单必须有可见 label；错误在字段或按钮附近；长表单保留自动保存与未保存关闭确认。
- icon-only 控制必须有 `aria-label`；颜色不是唯一状态信号。
- 桌面窗口焦点、拖拽、任务栏和关闭路径可预测；移动端不依赖 hover 或拖拽。
- 390×844 与 375×812 均不得出现页面级横向滚动；固定任务栏尊重 safe-area。
- 现有 PALIS 动效是显式批准的品牌例外，不按通用 200/400ms 建议改时长；仍须只使用 transform/opacity、按活动期设置 `will-change` 并支持 reduced-motion。

- [ ] **Step 5B: 用 `ui-checker` 审计基线**

记录每个问题的文件、行/选择器、严重度、为什么影响使用和建议修复；C00 只登记，不顺手修改。至少检查：

- 可访问名称、键盘顺序、焦点可见性和弹窗逃逸。
- 按钮的 hover/pressed/disabled/loading/error/empty 状态。
- 移动触控尺寸和间距。
- 固定任务栏、安全区、嵌套滚动和 z-index。
- `will-change`、布局属性动画、离屏循环动画和 reduced-motion。
- 现有 CSS token 与新增组件是否一致。

`package.json` 增加：

```json
"verify:baseline": "node scripts/capture-palis-baseline.mjs"
```

- [ ] **Step 6: 运行现有完整基线**

Run: `npm test`  
Expected: 所有既有测试 PASS，0 failures。

Run: `npm run build`  
Expected: exit 0。

Run: 启动 `npm run preview -- --host 127.0.0.1 --port 4173`，再执行 `npm run verify:baseline`。  
Expected: 两种尺寸的截图、manifest 和 motion/state JSON 生成成功。

- [ ] **Step 7: 记录基线并提交**

只提交脚本、测试、manifest 和计划更新；`tmp/verification/` 保持未跟踪。

Commit message: `test: freeze PALIS browser baseline`

---

### Task 2: C01 仓库合同

**Files:**
- Create: `src/archive-workflow/repository-contract.js`
- Create: `tests/archive-workflow-repository-contract.test.mjs`
- Modify: `src/archive-workflow/client.js`

**Interfaces:**
- Produces:
  - `ARCHIVE_WORKFLOW_METHODS: readonly string[]`
  - `assertArchiveWorkflowRepository(repository) -> repository`
- Contract methods:
  - `getProfile`
  - `listTemplates`
  - `listMyDrafts`
  - `saveDraft`
  - `submitDraft`
  - `listReviewQueue`
  - `reviewSubmission`
  - `publishContribution`
  - `inviteUser`
  - `listUsers`
  - `createUser`
  - `updateUserRole`
  - `resetUserPassword`
  - `deleteUser`
  - `listNotifications`
  - `markNotificationRead`
  - `searchArchives`
  - `listPublishedArchives`
  - `listEditableArchives`
  - `listAdminArchives`
  - `deleteArchive`
  - `loadArchiveEditorSource`
  - `listArchiveContributions`
  - `listArchiveReferences`
  - `uploadAttachment`

- [ ] **Step 1: 写不完整仓库会立即失败的测试**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARCHIVE_WORKFLOW_METHODS,
  assertArchiveWorkflowRepository,
} from '../src/archive-workflow/repository-contract.js';

test('repository contract identifies the first missing operation', () => {
  const repository = Object.fromEntries(
    ARCHIVE_WORKFLOW_METHODS
      .filter((method) => method !== 'publishContribution')
      .map((method) => [method, async () => null]),
  );
  assert.throws(
    () => assertArchiveWorkflowRepository(repository),
    /publishContribution/,
  );
});

test('repository contract returns a complete repository unchanged', () => {
  const repository = Object.fromEntries(
    ARCHIVE_WORKFLOW_METHODS.map((method) => [method, async () => null]),
  );
  assert.equal(assertArchiveWorkflowRepository(repository), repository);
});
```

- [ ] **Step 2: 验证 RED**

Run: `node --test tests/archive-workflow-repository-contract.test.mjs`  
Expected: FAIL，原因是合同模块不存在。

- [ ] **Step 3: 实现合同**

```js
export const ARCHIVE_WORKFLOW_METHODS = Object.freeze([
  'getProfile',
  'listTemplates',
  'listMyDrafts',
  'saveDraft',
  'submitDraft',
  'listReviewQueue',
  'reviewSubmission',
  'publishContribution',
  'inviteUser',
  'listUsers',
  'createUser',
  'updateUserRole',
  'resetUserPassword',
  'deleteUser',
  'listNotifications',
  'markNotificationRead',
  'searchArchives',
  'listPublishedArchives',
  'listEditableArchives',
  'listAdminArchives',
  'deleteArchive',
  'loadArchiveEditorSource',
  'listArchiveContributions',
  'listArchiveReferences',
  'uploadAttachment',
]);

export function assertArchiveWorkflowRepository(repository) {
  if (!repository || typeof repository !== 'object') {
    throw new TypeError('Archive workflow repository is required');
  }
  for (const method of ARCHIVE_WORKFLOW_METHODS) {
    if (typeof repository[method] !== 'function') {
      throw new TypeError(`Archive workflow repository is missing ${method}()`);
    }
  }
  return repository;
}
```

- [ ] **Step 4: 在生产构造边界执行合同**

`createArchiveWorkflowClient` 返回对象前调用：

```js
return assertArchiveWorkflowRepository({
  getProfile,
  listTemplates,
  // 按 ARCHIVE_WORKFLOW_METHODS 的完整顺序列出所有现有函数
  uploadAttachment,
});
```

- [ ] **Step 5: 验证 GREEN 和回归**

Run: `node --test tests/archive-workflow-repository-contract.test.mjs tests/archive-workflow-client.test.mjs`  
Expected: 新合同测试和现有 client 测试全部 PASS。

Run: `npm test`  
Expected: 0 failures。

- [ ] **Step 6: 提交**

Commit message: `refactor: define archive workflow repository contract`

---

### Task 3: C02 机械提取 Supabase Repository

**Files:**
- Create: `src/archive-workflow/repositories/supabase-repository.js`
- Create: `tests/supabase-archive-workflow-repository.test.mjs`
- Modify: `src/archive-workflow/client.js`
- Modify: `tests/archive-workflow-client.test.mjs`

**Interfaces:**
- Produces: `createSupabaseArchiveWorkflowRepository(supabase)`.
- Preserves: `createArchiveWorkflowClient(supabase)` and all current return/error behavior.

- [ ] **Step 1: 写新工厂的失败测试**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseArchiveWorkflowRepository } from '../src/archive-workflow/repositories/supabase-repository.js';

test('supabase repository rejects an incomplete Supabase client', () => {
  assert.throws(
    () => createSupabaseArchiveWorkflowRepository({ from() {} }),
    /configured Supabase client/,
  );
});

test('supabase repository preserves the public contribution RPC boundary', async () => {
  const calls = [];
  const repository = createSupabaseArchiveWorkflowRepository({
    from: () => { throw new Error('not used'); },
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: [], error: null };
    },
    functions: { invoke: async () => ({ data: null, error: null }) },
  });
  await repository.listArchiveContributions('archive-1');
  assert.deepEqual(calls, [{
    name: 'list_public_archive_contributions',
    args: { p_archive_id: 'archive-1' },
  }]);
});
```

- [ ] **Step 2: 验证 RED**

Run: `node --test tests/supabase-archive-workflow-repository.test.mjs`  
Expected: FAIL，原因是新模块不存在。

- [ ] **Step 3: 机械迁移**

1. 把 `ArchiveWorkflowError`、`normalizeError`、`unwrap`、`requireId` 和现有所有方法移入新文件。
2. 新工厂末尾调用 `assertArchiveWorkflowRepository`。
3. `client.js` 只保留兼容再导出：

```js
export {
  ArchiveWorkflowError,
  createSupabaseArchiveWorkflowRepository,
} from './repositories/supabase-repository.js';

export {
  createSupabaseArchiveWorkflowRepository as createArchiveWorkflowClient,
} from './repositories/supabase-repository.js';
```

4. 不改变查询、RPC 名、字段、错误文案和 Storage 路径。

- [ ] **Step 4: 验证 GREEN 和零行为差异**

Run: `node --test tests/supabase-archive-workflow-repository.test.mjs tests/archive-workflow-client.test.mjs`  
Expected: 全部 PASS。

Run: `npm test`  
Expected: 0 failures。

Run: `npm run build`  
Expected: exit 0，构建体积没有因复制实现异常增加。

- [ ] **Step 5: 提交**

Commit message: `refactor: isolate Supabase archive repository`

---

### Task 4: C03 本地事务核心

**Files:**
- Create: `src/archive-workflow/local/local-workflow-engine.js`
- Create: `src/archive-workflow/local/local-state.js`
- Create: `tests/local-workflow-engine.test.mjs`

**Interfaces:**
- Produces:
  - `createEmptyLocalState()`
  - `createLocalWorkflowEngine({readState, commitState, now, randomUUID, failAt})`
  - engine 实现完整 `ARCHIVE_WORKFLOW_METHODS`
- State keys: `profiles`、`templates`、`archives`、`contributions`、`versions`、`reviews`、`indexEntries`、`numberCounters`、`notifications`、`references`、`attachments`、`auditEvents`。

- [ ] **Step 1: 写本地管理员保存并提交草稿的失败测试**

测试使用真实 engine 和手写 state，不 mock engine：

```js
test('local administrator can save and submit a draft with a frozen signature', async () => {
  const harness = createStateHarness(createEmptyLocalState());
  const engine = createLocalWorkflowEngine({
    ...harness,
    now: () => '2026-07-28T12:00:00.000Z',
    randomUUID: () => 'draft-1',
  });

  const draft = await engine.saveDraft({
    ownerId: 'local-admin',
    title: '本地事件',
    kind: 'new',
    content: { schemaVersion: 3, category: 'event' },
  });
  const submitted = await engine.submitDraft(draft.id, 'local-admin');

  assert.equal(submitted.status, 'submitted');
  assert.equal(submitted.signature.displayName, '本地管理员');
  assert.equal(submitted.signature.systemRelease, 'VER 0.1 / 白幕初垂');
  assert.equal(submitted.reviewRound, 1);
});
```

- [ ] **Step 2: 验证 RED**

Run: `node --test tests/local-workflow-engine.test.mjs`  
Expected: FAIL，原因是本地 engine 不存在。

- [ ] **Step 3: 最小实现 saveDraft/submitDraft 和只读方法**

实现：

- `getProfile`
- `listTemplates`
- `listMyDrafts`
- `saveDraft`（revision CAS）
- `submitDraft`
- `searchArchives`
- `listPublishedArchives`
- `listEditableArchives`
- `listAdminArchives`
- `loadArchiveEditorSource`
- `listArchiveContributions`
- `listArchiveReferences`

每次 command：

1. `readState()` 得到深拷贝。
2. 校验身份、状态和 revision。
3. 修改拷贝。
4. `commitState(nextState)` 一次提交。
5. 返回深拷贝，禁止调用方修改内部 state。

- [ ] **Step 4: 验证 GREEN**

Run: `node --test tests/local-workflow-engine.test.mjs`  
Expected: save/submit 测试 PASS。

- [ ] **Step 5: 写审核、原子发布和并发编号的失败测试**

测试必须手写期望：

- `submitted → in_review → approved_for_accession → published`
- 事件首个计数器 26 时分配 `EV27`
- 修改已有档案保持档号，只从 `R02` 增至 `R03`
- 同一 `idempotencyKey` 重试返回同一发布结果
- `failAt` 为 `version`、`projection`、`archive`、`index`、`audit`、`notification` 时，提交前后 state 完全深相等
- 科考站/入口在 actor role 为 clerk 时创建被拒绝

- [ ] **Step 6: 验证 RED**

Run: `node --test tests/local-workflow-engine.test.mjs`  
Expected: 新发布测试因方法缺失或状态不支持而 FAIL。

- [ ] **Step 7: 实现剩余 command**

实现：

- `listReviewQueue`
- `reviewSubmission`
- `publishContribution`
- `inviteUser`
- `listUsers`
- `createUser`
- `updateUserRole`
- `resetUserPassword`（本地只记录重置事件，不保存明文）
- `deleteUser`
- `listNotifications`
- `markNotificationRead`
- `deleteArchive`（有版本/引用时拒绝）
- `uploadAttachment`（本地 metadata 和 Blob，5 个/10MB 双限制）

发布在一个 state copy 中完成，只有全部步骤成功后执行一次 `commitState`。正式编号映射固定为：

```js
{
  country: 'N',
  organization: 'O',
  station: 'ST',
  entrance: 'EN',
  ecology: 'E',
  person: 'P',
  event: 'EV',
  anomaly: 'A',
  species: 'S',
}
```

- [ ] **Step 8: 验证 GREEN 和 mutation check**

Run: `node --test tests/local-workflow-engine.test.mjs`  
Expected: 全部 PASS。

手工 mutation：

1. 暂时把 station 创建策略改为允许 clerk，权限测试必须 FAIL。
2. 暂时让事件计数器不递增，编号测试必须 FAIL。
3. 恢复源码并重跑，必须 PASS。

- [ ] **Step 9: 提交**

Commit message: `feat: add transactional local archive workflow`

---

### Task 5: C03 IndexedDB Repository

**Files:**
- Create: `src/archive-workflow/repositories/local-indexeddb-repository.js`
- Create: `src/archive-workflow/local/indexeddb-state-store.js`
- Create: `tests/local-indexeddb-browser.test.mjs`

**Interfaces:**
- Produces:
  - `LOCAL_DATABASE_NAME = "palis-local-verification-v1"`
  - `createLocalIndexedDbRepository({indexedDB, seed, now, randomUUID, failAt})`
  - `resetLocalDatabase()`
  - `exportLocalSnapshot()`
  - `importLocalSnapshot(snapshot)`

- [ ] **Step 1: 写真实浏览器持久化失败测试**

Puppeteer 测试启动本地页面，在浏览器上下文动态导入 repository：

1. reset。
2. 保存草稿。
3. 关闭 page。
4. 新开 page。
5. `listMyDrafts('local-admin')` 仍返回该草稿。
6. 断言资源请求中没有 Supabase hostname。

- [ ] **Step 2: 验证 RED**

Run: `node --test tests/local-indexeddb-browser.test.mjs`  
Expected: FAIL，原因是 IndexedDB repository 不存在。

- [ ] **Step 3: 实现 IndexedDB store**

使用一个 `state` object store、固定 key `current` 保存整个验证 state；每个 engine command 在单个 IndexedDB `readwrite` transaction 中读取并提交。导出格式：

```js
{
  schemaVersion: 1,
  databaseName: 'palis-local-verification-v1',
  exportedAt: 'ISO-8601',
  checksum: 'SHA-256 hex of canonical payload JSON',
  payload: { /* local state */ },
}
```

导入先在内存校验 schema、databaseName、checksum 和 state shape，通过后才开启写事务；失败不修改现有 key。

- [ ] **Step 4: 验证 GREEN**

Run: `node --test tests/local-indexeddb-browser.test.mjs`  
Expected: 持久化、合法导入、损坏导入保持原库、0 Supabase 请求全部 PASS。

- [ ] **Step 5: 提交**

Commit message: `feat: persist local archive workflow in IndexedDB`

---

### Task 6: C04 本地管理员运行时

**Files:**
- Create: `src/runtime/palis-runtime.js`
- Create: `src/archive-workflow/local/local-admin-runtime.js`
- Create: `tests/palis-runtime.test.mjs`
- Modify: `src/main.js`
- Modify: `src/auth.js`
- Modify: `src/archive-workflow/workspace.js`

**Interfaces:**
- Produces:
  - `isLoopbackHostname(hostname) -> boolean`
  - `shouldEnableLocalAdmin({dev, hostname, explicit}) -> boolean`
  - `initializePalisRuntime({reducedMotion}) -> Promise<{mode, repository, supabase, profile, role}>`

- [ ] **Step 1: 写三重启用条件失败测试**

```js
test('local admin requires development, loopback and explicit opt-in', () => {
  const base = { dev: true, hostname: '127.0.0.1', explicit: true };
  assert.equal(shouldEnableLocalAdmin(base), true);
  assert.equal(shouldEnableLocalAdmin({ ...base, dev: false }), false);
  assert.equal(shouldEnableLocalAdmin({ ...base, hostname: 'preview.example' }), false);
  assert.equal(shouldEnableLocalAdmin({ ...base, explicit: false }), false);
  assert.equal(shouldEnableLocalAdmin({ ...base, hostname: 'localhost' }), true);
  assert.equal(shouldEnableLocalAdmin({ ...base, hostname: '::1' }), true);
});
```

- [ ] **Step 2: 验证 RED**

Run: `node --test tests/palis-runtime.test.mjs`  
Expected: FAIL，原因是 runtime 模块不存在。

- [ ] **Step 3: 实现运行时选择**

显式标记使用 `VITE_PALIS_LOCAL_ADMIN=1`；只有条件成立才执行：

```js
const { createLocalAdminRuntime } = await import(
  '../archive-workflow/local/local-admin-runtime.js'
);
```

生产路径继续调用 `initializeAccessGate` 和 `createArchiveWorkflowClient`。本地路径：

- 不创建 Supabase client。
- profile 固定 `{id:"local-admin",display_name:"本地管理员",role:"admin",enabled:true}`。
- 解锁 experience。
- 设置 `body.dataset.accessMode = "local-admin"`。
- 派发当前 `palis:session-change` 事件 shape，`preview:false`。
- 返回 IndexedDB repository。

- [ ] **Step 4: 修改启动接线**

`main.js` 改为从 runtime 取得 repository，再调用：

```js
initializeArchiveWorkspace({ client: runtime.repository });
```

公开云档案读取也使用 repository，而不是判断 `supabase` 是否存在。

- [ ] **Step 5: 验证 GREEN**

Run: `node --test tests/palis-runtime.test.mjs tests/archive-workflow-client.test.mjs tests/clerk-workspace.test.mjs`  
Expected: 全部 PASS。

Run: `npm test`  
Expected: 0 failures。

- [ ] **Step 6: 提交**

Commit message: `feat: add loopback-only local administrator runtime`

---

### Task 7: C05 本地验证控制面板与生产安全门禁

**Files:**
- Create: `src/archive-workflow/local/local-verification-panel.js`
- Create: `src/archive-workflow/local/local-fixtures.js`
- Create: `scripts/verify-local-admin.mjs`
- Create: `scripts/assert-production-safe.mjs`
- Create: `tests/local-admin-browser.test.mjs`
- Create: `tests/production-safe.test.mjs`
- Modify: `index.html`
- Modify: `src/archive-workflow/workspace.css`
- Modify: `src/archive-workflow/workspace.js`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - DEV-01—DEV-07 控制面板。
  - `npm run dev:local-admin`
  - `npm run verify:local`
  - `npm run build:safe`

- [ ] **Step 1: 写生产扫描失败测试**

测试在临时目录构造：

- 安全产物：扫描 exit 0。
- 含 `LOCAL ADMIN / 本地数据`：扫描非零。
- 含 `palis-local-verification-v1`：扫描非零。
- 含 `VITE_PALIS_LOCAL_ADMIN`：扫描非零。
- 含 `SERVICE_ROLE_KEY`（大小写和连接符归一化）：扫描非零。

- [ ] **Step 2: 验证 RED**

Run: `node --test tests/production-safe.test.mjs`  
Expected: FAIL，原因是扫描模块不存在。

- [ ] **Step 3: 实现生产安全扫描**

`assert-production-safe.mjs` 递归读取指定 dist，跳过二进制文件，对以下标记任一命中即输出文件并 exit 1：

```text
LOCAL ADMIN / 本地数据
palis-local-verification-v1
VITE_PALIS_LOCAL_ADMIN
service-role
service_role
SERVICE ROLE
```

- [ ] **Step 4: 验证 GREEN**

Run: `node --test tests/production-safe.test.mjs`  
Expected: 全部 PASS。

- [ ] **Step 5: 写本地管理员完整浏览器失败测试**

真实浏览器测试：

1. 无登录表单直接进入体验。
2. 打开管理员工作台，DEV-01 可见。
3. 管理员新建事件草稿、保存、提交、批准、正式发布。
4. 正式档号为夹具计数器之后的 `EV27`。
5. 署名包含本地管理员和 `VER 0.1 / 白幕初垂`。
6. 新事件出现在事件索引投影。
7. 权限预演切到 clerk 后 station/entrance 新建被拒绝。
8. 退出预演恢复 admin。
9. 全过程 0 Supabase/Storage/Functions 请求。

- [ ] **Step 6: 验证 RED**

Run: `node --test tests/local-admin-browser.test.mjs`  
Expected: FAIL，原因是本地面板/夹具/接线尚未完成。

- [ ] **Step 7: 实现本地面板和夹具**

仅在 `mode === "local-admin"` 时把 DEV-01—07 插入现有工作台 utilities；使用现有 `retro-window`、title bar、按钮和确认弹窗 class，不新增主题。

夹具包含：

- 九类各一份正式档案。
- 一份科考站和一份白幕入口。
- 事件计数器 26。
- 一份退回件、一份受限档案、一份封存档案、一份离线档案。
- 长标题、超长自定义词条、失效引用和附件边界样本。

DEV-06 失败注入只保存在当前 JS 内存，刷新后清空。

实现前使用 `ui-ux-pro-max` 确认控制面板的信息层级：

1. 当前模式与数据库名始终可见。
2. “重置/导入/清除附件”与普通操作空间分离。
3. 每个页面只有一个主要动作；危险动作使用现有 PALIS danger token 和确认窗。
4. 错误显示在触发动作附近并给出恢复路径。
5. 空状态只有一个明确下一步。

实现后使用 `ui-checker` 验证：

- 不新增颜色、字体、渐变、阴影体系或动画曲线。
- 图标继续使用现有 SVG，不使用 emoji。
- icon-only 控制具备 `aria-label`。
- 移动端所有关键触控区域至少 44×44px；桌面紧凑视觉可通过扩展命中区实现。
- loading 时按钮 disabled 且有文字反馈；错误使用 `aria-live`，但不抢焦点。
- 破坏性确认聚焦在安全选项，取消后焦点回触发按钮。
- 390×844、375×812、桌面 1440×900、移动横屏和 reduced-motion 全部通过。

- [ ] **Step 8: 增加命令**

`package.json`：

```json
"dev:local-admin": "vite --host 127.0.0.1 --mode local-admin",
"verify:local": "node scripts/verify-local-admin.mjs",
"assert:production-safe": "node scripts/assert-production-safe.mjs dist",
"build:safe": "vite build && node scripts/assert-production-safe.mjs dist"
```

`.env.local-admin`：

```text
VITE_PALIS_LOCAL_ADMIN=1
```

该文件只含非秘密布尔标记，可以提交；生产构建不使用此 mode。

- [ ] **Step 9: 验证 GREEN**

Run: `node --test tests/local-admin-browser.test.mjs tests/production-safe.test.mjs`  
Expected: 全部 PASS。

Run: `npm test`  
Expected: 0 failures。

Run: `npm run verify:local`  
Expected: 完整本地管理员流程 PASS，0 外部工作流请求。

Run: `npm run build:safe`  
Expected: 构建成功且生产扫描 PASS。

- [ ] **Step 10: 视觉对账**

运行 Task 1 基线脚本，生成改造后桌面/移动截图。除明确新增的 LOCAL ADMIN 状态与验证面板外，稳定区域差异不得超过 0.5%；九类和原窗口未改动。

- [ ] **Step 11: 提交**

Commit message: `feat: add local PALIS administrator verification`

---

## Batch Checkpoint

C00—C05 完成后暂停，不继续窗口壳或九类索引重写，提交以下证据给委托人：

1. 所有测试和安全构建的完整计数。
2. 本地管理员无登录进入截图。
3. EV27 本地完整流程截图与导出快照。
4. 0 Supabase/Storage/Functions 请求记录。
5. 生产产物安全扫描记录。
6. 视觉基线前后对比。
7. 未触碰生产数据库和 Cloudflare 的确认。
