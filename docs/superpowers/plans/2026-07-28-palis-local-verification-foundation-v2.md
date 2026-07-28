# PALIS Local Verification Foundation V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立不需要登录或 Supabase 的本地全权限管理员运行时，并用同一仓储合同验证草稿、提交、审核、正式录入、编号、索引投影、事务回滚与生产隔离。

**Architecture:** 先冻结真实浏览器基线，再把现有 Supabase client 机械拆成 repository。业务 UI 只依赖一份带明确参数与 snake_case 返回形状的合同；本地实现由纯事务引擎和 IndexedDB store 组成，生产与本地运行时通过可被 Vite 静态裁剪的分支选择。所有本地面板、夹具、数据库名和失败注入仅存在于 DEV 模块图中。

**Tech Stack:** Vite 7、原生 ES modules、Node `node:test`、Puppeteer Core、IndexedDB、Supabase JS、原生 HTML/CSS。

## Scope Boundary

本计划只交付“可安全实施与验收后续档案改造”的基础层 C00–C05。以下内容必须在基础层全绿后由各自独立计划实施：

- PALIS × Win95 管理员/书记官共享工作台外壳。
- 当前档案专属的自由词条、空白扩展页和空白修改页。
- 九类自动业务编号、提交章、正式修订号和生产数据库迁移。
- 九类索引投影、事件时间轴修复、旧数据迁移和免费服务器优化。

基础层不得以临时 UI 或本地特例替代上述正式实现。

## Global Constraints

- 九类现有公开排版、PALIS 配色、字体、纹理、SVG 图标、光标、窗口、弹窗和动效不得换皮。
- 科考站和白幕入口：书记官只能申请修改；管理员可以新建、修改和设定。
- 当前编辑文档合同保持 `schemaVersion === 2`；本计划不得提前发明 UI 不认识的版本。
- 当前审核状态保持 `draft → submitted → approved|changes_requested → published`；`approved` 的界面含义为“批准进入正式录入”。
- 仓储合同必须同时固定方法、参数、错误码、snake_case 字段和嵌套关系，不得只检查方法存在。
- 本地管理员 ID 固定为 `local-admin`，默认拥有全部管理员能力。
- 所有本地写操作必须通过一次 `transactState()`；禁止一个 command 分别开启读事务和写事务。
- 本地模式不得请求 Supabase、Storage 或 Edge Functions，不得包含或需要 service role key。
- 本地模式只有 `import.meta.env.DEV`、loopback origin 和显式启动标记同时满足时启用。
- 本地 HTML、CSS、fixtures、数据库名和失败注入不得进入 production module graph。
- 默认 `npm run build` 自身必须执行生产安全扫描。
- 所有浏览器测试自行启动随机端口服务器并清理 page、browser 和 server。
- 不新增 React、Vue、Tailwind、Radix、Base UI 或通用后台组件库。
- 每项生产代码必须先有一个因目标行为缺失而失败的真实行为测试。
- 每个任务完成后运行聚焦测试；每个 task 完成后运行 `npm test`，涉及 bundle 时再运行默认 `npm run build`。
- 不修改已执行 migration；数据库能力变化只能新增 migration。
- 未经委托人明确授权，不部署生产、不连接生产数据库写入、不推送 Cloudflare。

---

### Task 1: C00 可重复浏览器基线

**Files:**
- Modify: `scripts/palis-browser-runtime.mjs`
- Create: `scripts/palis-browser-harness.mjs`
- Create: `scripts/palis-page-fixture.mjs`
- Replace: `scripts/capture-palis-baseline.mjs`
- Create: `scripts/compare-palis-baseline.mjs`
- Modify: `tests/palis-browser-runtime.test.mjs`
- Create: `tests/palis-baseline-harness.test.mjs`
- Modify: `docs/verification/palis-ui-invariants.md`
- Replace: `docs/verification/palis-baseline-manifest.json`
- Modify: `package.json`

**Interfaces:**
- Produces: `resolveBrowserExecutable(candidates, fileExists) -> string`
- Produces: `parseViewport("1440x900") -> {width,height}`
- Produces: `startPalisPreview({root, port}) -> Promise<{url, close}>`
- Produces: `installPalisPageFixture(page, {freezeAt}) -> Promise<requestLog>`
- Produces: `waitForPalisScene(page, scene) -> Promise<void>`
- Produces: `capturePalisScenes({outputMode, viewports}) -> Promise<manifest>`
- Produces: `comparePalisManifests({baselinePath,currentPath,threshold}) -> Promise<report>`

- [x] **Step 1: 写浏览器路径与 viewport 的失败测试**

`tests/palis-browser-runtime.test.mjs` 已覆盖：

```js
assert.deepEqual(parseViewport('1440x900'), { width: 1440, height: 900 });
assert.throws(() => parseViewport('0x900'), /positive/);
assert.equal(
  resolveBrowserExecutable(['C:/missing.exe', 'C:/Edge/msedge.exe'], exists),
  'C:/Edge/msedge.exe',
);
```

- [x] **Step 2: 验证 RED 后实现最小 runtime**

已完成真实 RED/GREEN；本机 Edge 候选已可解析。

- [ ] **Step 3: 补全浏览器候选与规范化测试**

加入 `%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe`，并断言环境变量路径会去除首尾空格和成对引号：

```js
assert.equal(
  normalizeBrowserPath('  "C:/Edge/msedge.exe"  '),
  'C:/Edge/msedge.exe',
);
```

Run: `node --test tests/palis-browser-runtime.test.mjs`

Expected: 新测试先因 `normalizeBrowserPath` 缺失而 FAIL。

- [ ] **Step 4: 实现自管理 preview server**

`startPalisPreview` 使用 Vite `preview()` API、`host: "127.0.0.1"` 和调用方传入的端口；测试默认传 `0` 获取随机端口。返回的 `close()` 必须关闭 Vite server 和底层 HTTP server，并能重复调用。

先写测试：

```js
const preview = await startPalisPreview({ root: fixtureRoot, port: 0 });
const response = await fetch(preview.url);
assert.equal(response.status, 200);
await preview.close();
await assert.rejects(fetch(preview.url));
```

Run: `node --test tests/palis-baseline-harness.test.mjs`

Expected: FAIL，原因是 `palis-browser-harness.mjs` 不存在。

- [ ] **Step 5: 实现确定性页面夹具**

`installPalisPageFixture` 必须在 `goto` 前完成：

1. `page.emulateTimezone("Asia/Shanghai")`。
2. `page.evaluateOnNewDocument` 固定 `Date` 为 `2026-07-28T12:00:00.000Z`。
3. 拦截 `setInterval(..., 260)`，只冻结吉祥物换帧，不停止其他 interval。
4. 模拟 `prefers-reduced-motion: reduce`。
5. 启用请求拦截：
   - 当前 loopback origin、`data:`、`blob:` 正常放行。
   - `/rest/v1/archives` 返回 `200 []` 和 `application/json`。
   - 其他外部 URL 终止并记录为 fatal。
6. 页面稳定后把吉祥物固定为 `/assets/mascot/idle-02.png` 并等待 `decode()`。

测试必须断言固定后的两次 `Date.now()` 相同、260ms callback 未执行、普通 30s interval 仍被注册、未知外网请求使结果失败。

- [ ] **Step 6: 实现可靠场景等待**

`waitForPalisScene` 使用状态选择器，不使用固定 sleep：

```js
const DIRECTORY_SCENES = {
  countries: ['country-stack', '.country-stack-vault', 18],
  organizations: ['network', '.organization-lane', 23],
  stations: ['station-board', '.station-coordinate-board', 20],
  entrances: ['entrance-network', '.entrance-sheet-console', 18],
  ecology: ['ecology-strata', '.eco-log-console', 7],
  people: ['dossier', '.people-network-workbench', 36],
  events: ['event-plane', '.event-plane', 26],
  abnormalities: ['anomaly-monitor', '.anomaly-carousel', 25],
  species: ['species-helix', '.species-helix-console', 22],
};
```

目录顺序必须是：

1. 点击 `#access-preview` 并等待 `body[data-access-mode="preview"] #experience:not([inert])`。
2. 精确关闭 `#version-notice button[data-version-notice-action="close"]`。
3. 滚动到 `(scrollHeight - innerHeight) * 2 / 3`。
4. 等待根目录 `body[data-chapter="2"] #archive-layer.is-active:not(.has-directory)[aria-hidden="false"]` 与 `#folder-orbit[data-category="root"][data-mode="orbit"]`。
5. 用 `.folder-button.is-folder[data-code="01"..."09"]` 的 DOM `click()` 进入目录；不得使用 `nth-child`、坐标点击或 `?dir=` 深链。
6. 等待 `#archive-layer.is-active.has-directory[aria-hidden="false"]`，同时核对 `#folder-orbit[data-category="<id>"][data-mode="<mode>"]`、结构 selector 和条目数量。
7. 等待字体、所有可见图片 `decode()` 和两个 animation frame。
8. 截图后点击 `#archive-back:not([hidden])`，等待根目录恢复，再进入下一类。

工作台注入必须同时设置：

```js
document.body.dataset.accessMode = 'authenticated';
document.body.dataset.operatorRole = role;
window.dispatchEvent(new CustomEvent('palis:session-change', { detail }));
```

然后点击 `#clerk-workspace-entry` 并等待 `body.clerk-desktop-open #clerk-desktop.is-open:not([hidden])`。

- [ ] **Step 7: 分离 baseline、current 与像素比较**

截图器始终只写 current，只有比较器带显式参数时才能接受新基准：

- `capture-palis-baseline.mjs` 只写 `tmp/verification/current/manifest.json` 和 current PNG。
- `compare-palis-baseline.mjs` 默认读取 `tmp/verification/baseline/manifest.json` 与 current。
- `compare-palis-baseline.mjs --update-baseline` 先要求结构、请求、console/pageerror 全部通过，再用 current 替换 baseline，并同步 `docs/verification/palis-baseline-manifest.json`。
- diff PNG 与报告写入 `tmp/verification/diff/`。

manifest 必须记录：浏览器版本、Puppeteer 版本、OS、viewport、deviceScaleFactor、locale、timezone、字体检查、WebGL vendor/renderer、dist 入口 hash、允许/拦截请求和截图 SHA-256；不得写浏览器绝对路径。

新增 devDependencies `pixelmatch` 与 `pngjs`，只用于本地验收，不进入生产 bundle。比较参数固定为 `threshold: 0.1`、`includeAA: false`、`alpha: 0.5`；`changedPixels / totalPixels > 0.005` 时失败。SHA-256 只用于产物溯源。

测试建立 10×10 图片，改变 1 个像素：

```js
assert.equal(await ratio(same, same), 0);
assert.equal(await ratio(base, onePixelChanged), 0.01);
await assert.rejects(compare({ threshold: 0.005 }), /1.000%/);
```

- [ ] **Step 8: 增加自包含命令**

`package.json`：

```json
{
  "verify:baseline:update": "npm run build && node scripts/capture-palis-baseline.mjs && node scripts/compare-palis-baseline.mjs --update-baseline",
  "verify:baseline": "npm run build && node scripts/capture-palis-baseline.mjs && node scripts/compare-palis-baseline.mjs"
}
```

三种 viewport 固定为 `1440x900,390x844,844x390`。场景固定为首次进入首页、关闭版本窗后的干净首页、书记官工作台、管理员工作台和九类目录，共 39 张截图。

- [ ] **Step 9: 运行并目视检查基线**

Run:

```text
node --test tests/palis-browser-runtime.test.mjs tests/palis-baseline-harness.test.mjs
npm test
npm run build
npm run verify:baseline:update
npm run verify:baseline
```

Expected: 全部 exit 0；第二次采集不修改 baseline manifest；九类截图实际处于 chapter 2；diagnostics 为空；外部实际放行请求数为 0。

使用 `view_image` 检查首页、两个角色工作台、事件目录的三种 viewport。

- [ ] **Step 10: 提交**

只 stage C00 文件，不 stage `tmp/`、`supabase/.temp/` 或其他任务文件。

Commit: `test: freeze deterministic PALIS browser baseline`

---

### Task 2: C01 仓储方法与返回形状合同

**Files:**
- Create: `src/archive-workflow/repository-contract.js`
- Create: `tests/helpers/archive-workflow-repository-conformance.mjs`
- Create: `tests/archive-workflow-repository-contract.test.mjs`
- Create: `tests/archive-workflow-repository-shapes.test.mjs`
- Modify: `src/archive-workflow/client.js`

**Interfaces:**
- Produces: `ARCHIVE_WORKFLOW_METHODS: readonly string[]`
- Produces: `assertArchiveWorkflowRepository(repository) -> repository`
- Produces: `assertArchiveWorkflowResult(method, result) -> result`
- Test-only: `defineArchiveWorkflowRepositoryConformance(name, createHarness)`

**Canonical signatures and minimum return shapes:**

| Method | Input | Minimum output consumed by UI |
|---|---|---|
| `getProfile` | `(userId)` | `{id,email,display_name,role,enabled}` |
| `listTemplates` | `()` | `[{id,code,category,title,schema,active}]` |
| `listMyDrafts` | `(ownerId)` | contribution array |
| `saveDraft` | `(camelCaseDraft)` | contribution or conflict object |
| `submitDraft` | `(draftId,ownerId)` | contribution |
| `listReviewQueue` | `()` | contributions with `owner.display_name` and optional `archive` |
| `reviewSubmission` | `(id,{decision,message})` | contribution with `status` |
| `publishContribution` | `(id,registration)` | `{archiveId,versionId,status:"published"}` |
| `inviteUser` | `({email,displayName,role})` | action result |
| `listUsers` | `()` | profile array |
| `createUser` | `({email,displayName,role,password})` | action result |
| `updateUserRole` | `(userId,role)` | action result |
| `resetUserPassword` | `(userId,password)` | action result |
| `deleteUser` | `(userId)` | action result |
| `listNotifications` | `(recipientId)` | notifications with optional `contribution` |
| `markNotificationRead` | `(notificationId,recipientId)` | notification with `read_at` |
| `searchArchives` | `(query,{limit})` | archive read models |
| `listPublishedArchives` | `({limit})` | archive read models |
| `listEditableArchives` | `({query,category,limit})` | archive read models |
| `listAdminArchives` | `({query,limit})` | archive read models |
| `deleteArchive` | `(archiveId)` | `{id,code,title}` |
| `loadArchiveEditorSource` | `(archiveId)` | `null` or `{archiveId,contributionId,versionId,content}` |
| `listArchiveContributions` | `(archiveId)` | contributions with `owner` and `versions[]` |
| `listArchiveReferences` | `(archiveId)` | references with `source_archive` |
| `uploadAttachment` | `(contributionId,ownerId,file)` | attachment metadata |

Contribution minimum shape:

```js
{
  id,
  archive_id,
  template_id,
  owner_id,
  title,
  kind,
  status,
  draft_content,
  revision,
  updated_at,
}
```

Archive read model must preserve `id/code/category/title/visibility/sequence_number/abbreviation`。版本必须保留 `version_label/content/submitter/modifier/reviewer`。CAS 冲突固定为 `{status:"conflict",conflict:true,cloud}`。

- [ ] **Step 1: 写方法缺失 RED**

```js
const incomplete = completeRepositoryExcept('publishContribution');
assert.throws(
  () => assertArchiveWorkflowRepository(incomplete),
  /publishContribution/,
);
```

Run: `node --test tests/archive-workflow-repository-contract.test.mjs`

Expected: FAIL，合同模块不存在。

- [ ] **Step 2: 实现方法存在性合同**

`ARCHIVE_WORKFLOW_METHODS` 必须按上表 25 个方法定义并 `Object.freeze()`；允许 repository 携带 reset/export/import 等额外方法。

Run: `node --test tests/archive-workflow-repository-contract.test.mjs`

Expected: PASS。

- [ ] **Step 3: 写返回形状 RED**

使用合法 fixture 逐项通过，然后分别删除 `draft_content`、`owner.display_name`、`sequence_number` 和 `versions[0].content`：

```js
assert.doesNotThrow(() => assertArchiveWorkflowResult('saveDraft', draft));
assert.throws(
  () => assertArchiveWorkflowResult('saveDraft', without(draft, 'draft_content')),
  /draft_content/,
);
```

Run: `node --test tests/archive-workflow-repository-shapes.test.mjs`

Expected: FAIL，shape validator 不存在。

- [ ] **Step 4: 实现 shape validator 与错误合同**

只校验 UI 实际消费的字段，不禁止额外字段。固定错误行为：

- 空 ID：`ArchiveWorkflowError.code === "invalid_input"`。
- 非正 revision：`invalid_revision`。
- 非 `approved|changes_requested`：`invalid_decision`。
- 空审核批复：`reply_required`。
- 密码少于 8 字符：`invalid_password`。
- 附件不在 1 byte–5MB：`invalid_attachment`。

文档内容只接受当前 `schemaVersion === 2`；不得加入 `approved_for_accession`。

- [ ] **Step 5: 建立复用 conformance helper**

`createHarness()` 返回：

```js
{
  repository,
  seed,
  inspectState,
  setPrincipal,
}
```

helper 注册三组测试：

1. draft 保存、snake_case 返回、CAS conflict、返回值深拷贝。
2. review queue 嵌套 owner/archive、批准与退回状态。
3. publish 返回、archive read model 和 public contribution 版本关系。

先用一个内存 compliant stub 运行 helper，证明 helper 会在故意移除 `owner` 时失败。

- [ ] **Step 6: 在现有 client 构造边界执行方法合同**

`createArchiveWorkflowClient` 返回前调用：

```js
return assertArchiveWorkflowRepository({
  getProfile,
  listTemplates,
  listMyDrafts,
  saveDraft,
  submitDraft,
  listReviewQueue,
  reviewSubmission,
  publishContribution,
  inviteUser,
  listUsers,
  createUser,
  updateUserRole,
  resetUserPassword,
  deleteUser,
  listNotifications,
  markNotificationRead,
  searchArchives,
  listPublishedArchives,
  listEditableArchives,
  listAdminArchives,
  deleteArchive,
  loadArchiveEditorSource,
  listArchiveContributions,
  listArchiveReferences,
  uploadAttachment,
});
```

- [ ] **Step 7: 验证并提交**

Run:

```text
node --test tests/archive-workflow-repository-contract.test.mjs tests/archive-workflow-repository-shapes.test.mjs tests/archive-workflow-client.test.mjs
npm test
```

Expected: 0 failures。

Commit: `refactor: define archive repository conformance`

---

### Task 3: C02 机械提取 Supabase Repository

**Files:**
- Create: `src/archive-workflow/repositories/supabase-repository.js`
- Create: `tests/supabase-archive-workflow-repository.test.mjs`
- Modify: `src/archive-workflow/client.js`
- Modify: `tests/archive-workflow-client.test.mjs`

**Interfaces:**
- Produces: `createSupabaseArchiveWorkflowRepository(supabase)`
- Preserves: `createArchiveWorkflowClient(supabase)`

- [ ] **Step 1: 写新工厂 RED**

```js
assert.throws(
  () => createSupabaseArchiveWorkflowRepository({ from() {} }),
  /configured Supabase client/,
);
```

并断言 `listArchiveContributions("archive-1")` 仍调用：

```js
{
  name: 'list_public_archive_contributions',
  args: { p_archive_id: 'archive-1' },
}
```

Run: `node --test tests/supabase-archive-workflow-repository.test.mjs`

Expected: FAIL，新模块不存在。

- [ ] **Step 2: 机械迁移，不做业务重写**

把 `ArchiveWorkflowError`、`normalizeError`、`unwrap`、`requireId` 和 25 个现有方法原样迁入 `supabase-repository.js`。不改变查询字段、RPC 名、Edge Function 名、Storage 路径、错误文案或返回值。

工厂末尾依次调用：

```js
return assertArchiveWorkflowRepository(repository);
```

`client.js` 只保留兼容再导出。

- [ ] **Step 3: 调整源码安全测试位置**

`tests/archive-workflow-client.test.mjs` 中查找 `.eq("owner_id")`、revision CAS 和公开 RPC 的断言改为读取 `supabase-repository.js`；另加断言证明 `client.js` 的 `createArchiveWorkflowClient` 与新工厂是同一函数。

- [ ] **Step 4: 运行 Supabase conformance**

Supabase mock harness 必须跑 C01 的三组 conformance。API 列表直接遍历 `ARCHIVE_WORKFLOW_METHODS`，不得维护第二份方法数组。

Run:

```text
node --test tests/supabase-archive-workflow-repository.test.mjs tests/archive-workflow-client.test.mjs
npm test
npm run build
```

Expected: 0 failures；bundle 中只有一份 Supabase repository 实现。

- [ ] **Step 5: 提交**

Commit: `refactor: isolate Supabase archive repository`

---

### Task 4: C03a 纯事务本地工作流引擎

**Files:**
- Create: `src/archive-workflow/local/local-state.js`
- Create: `src/archive-workflow/local/local-workflow-engine.js`
- Create: `tests/helpers/local-workflow-harness.mjs`
- Create: `tests/local-workflow-engine.test.mjs`

**Interfaces:**
- Produces: `createEmptyLocalState()`
- Produces: `createLocalWorkflowEngine({readState,transactState,getPrincipal,now,randomUUID,failAt})`
- Consumes: `transactState(syncReducer) -> Promise<result>`

State keys:

```text
profiles, templates, archives, contributions, versions, reviews,
indexEntries, numberCounters, notifications, references, attachments,
auditEvents, idempotencyResults
```

`createEmptyLocalState()` 必须真正为空；`local-admin` 和九类模板由测试/fixture 显式 seed。

- [ ] **Step 1: 写 principal 与草稿 RED**

```js
const engine = createEngineAs('local-admin', 'admin');
const draft = await engine.saveDraft({
  ownerId: 'spoofed-user',
  templateId: '07',
  title: '本地事件',
  kind: 'new',
  content: { schemaVersion: 2, templateCode: '07', values: {} },
});
assert.equal(draft.owner_id, 'local-admin');
assert.equal(draft.draft_content.schemaVersion, 2);
```

另断言 clerk 对 `ownerId` 冒充其他账号会得到 `permission_denied`。

Run: `node --test tests/local-workflow-engine.test.mjs`

Expected: FAIL，引擎不存在。

- [ ] **Step 2: 实现 read 方法与 draft/submit command**

只读方法调用 `readState()`；写方法恰好调用一次：

```js
return transactState((currentState) => {
  const nextState = structuredClone(currentState);
  // 同步验证并修改 nextState
  return { nextState, result: structuredClone(savedRecord) };
});
```

回调不得 `await`。`submitDraft` 把状态改为 `submitted`，冻结：

```js
{
  submitter_id: principal.id,
  submitter_name: principal.display_name,
  system_version: '0.1',
  system_theme: '白幕初垂',
  submitted_at: now(),
}
```

该快照先保存在本地 state 的审计字段中；正式生产字段由后续 migration 计划接入。

- [ ] **Step 3: 写权限、审核与账号 RED**

必须覆盖：

- clerk 不能 `reviewSubmission/publishContribution/createUser/deleteUser`。
- clerk 新建 station/entrance 被拒绝；admin 新建成功。
- 审核 decision 只有 `approved` 和 `changes_requested`。
- 退回后再次保存保持同一 contribution 并增加 revision。
- `createUser/resetUserPassword` 校验密码后立即丢弃；state、audit 和导出视图都不含密码。
- principal role 改变后下一次 command 立即按新权限计算。

- [ ] **Step 4: 实现审核、用户、通知与附件**

实现剩余非发布写方法。附件限制与现有生产 client 一致：1 byte–5MB；保存 Blob 与 metadata，返回值为深拷贝。`deleteArchive` 在存在版本或引用时返回 `archive_has_history`。

- [ ] **Step 5: 写原子发布 RED**

从事件计数器 26 开始：

```js
const result = await engine.publishContribution('submission-1', {
  category: 'event',
  version: '0.1',
  visibility: 'public',
  idempotencyKey: 'publish-1',
});
assert.deepEqual(result, {
  archiveId: 'archive-1',
  versionId: 'version-1',
  status: 'published',
});
```

同时检查：

```js
assert.equal(archive.code, 'EV27');
assert.equal(archive.sequence_number, 27);
assert.equal(archive.abbreviation, 'RLL');
assert.equal(formalNumber(archive), '027.RLL');
```

九类 code prefix 固定为 `N/O/ST/EN/E/P/EV/A/S`；正式 abbreviation 固定为 `REG/CHN/LOG/CRD/ECO/PER/RLL/TRC/SPC`。业务 code 与 `sequence_number + abbreviation` 是两个字段，不得互相覆盖。

对 `version/projection/archive/index/audit/notification` 六个 failpoint 分别断言 state 与 commit count 完全不变。同一 idempotency key 重试不得重复编号、版本、通知或审计。

- [ ] **Step 6: 实现单事务 publish**

在同一个 reducer 内依次：

1. 验证 principal、submission.status 和类别新建策略。
2. 检查 idempotencyResults。
3. 原子增加类别 counter。
4. 新建或读取 archive identity。
5. 新建 immutable version。
6. 建立最小 index projection。
7. 更新 archive current version。
8. 写 audit、notification、references。
9. 保存 idempotency result。
10. reducer 成功返回后才由 store put。

修改既有 archive 时保留 `code/sequence_number/abbreviation`；本计划不引入未定义的 `R02 → R03` 字符串。

- [ ] **Step 7: 跑完整 conformance 与 mutation check**

Run:

```text
node --test tests/local-workflow-engine.test.mjs
npm test
```

Expected: engine 通过 C01 conformance，所有返回值深拷贝。

Mutation：

1. 临时允许 clerk 新建 station，权限测试必须 FAIL。
2. 临时不递增 event counter，编号测试必须 FAIL。
3. 恢复源码后全部 PASS。

- [ ] **Step 8: 提交**

Commit: `feat: add transactional local archive engine`

---

### Task 5: C03b IndexedDB Repository

**Files:**
- Create: `src/archive-workflow/local/indexeddb-state-store.js`
- Create: `src/archive-workflow/local/local-snapshot-codec.js`
- Create: `src/archive-workflow/repositories/local-indexeddb-repository.js`
- Create: `tests/fixtures/indexeddb-harness.html`
- Create: `tests/helpers/palis-test-server.mjs`
- Create: `tests/local-indexeddb-browser.test.mjs`

**Interfaces:**
- Produces: `createIndexedDbStateStore({indexedDB,databaseName})`
- Store: `{readState,transactState,close,reset}`
- Produces: `createLocalIndexedDbRepository({indexedDB,getPrincipal,seed,now,randomUUID,failAt})`
- Extra instance methods: `resetLocalDatabase/exportLocalSnapshot/importLocalSnapshot`

- [ ] **Step 1: 写自启动 fixture RED**

测试通过 Vite API 启动随机端口，只加载 `indexeddb-harness.html`，不得加载 `main.js` 或 `auth.js`。

```js
const server = await startPalisTestServer();
const page = await browser.newPage();
await page.goto(`${server.url}/tests/fixtures/indexeddb-harness.html`);
```

Run: `node --test tests/local-indexeddb-browser.test.mjs`

Expected: FAIL，helper/repository 不存在。

- [ ] **Step 2: 实现单 readwrite transaction store**

`transactState` 打开一个 `readwrite` transaction，在 `get("current").onsuccess` 内同步执行 reducer，再 `put(nextState,"current")`，最后等待 transaction complete。reducer 抛错时调用 `transaction.abort()`。

两个 page 对同一数据库同时发布，必须得到 27 和 28，不得丢更新。

- [ ] **Step 3: 写持久化、并发和回滚测试**

覆盖：

1. page A 保存草稿，关闭后 page B 仍读到。
2. page A/B 并发发布取得不同编号。
3. reducer 抛错后 current key 未变化。
4. 每个 command 只产生一个 readwrite transaction。
5. `versionchange` 自动关闭连接。
6. reset blocked 在 2 秒内返回明确错误，不永久挂起。
7. 网络只允许当前 loopback、`data:` 和 `blob:`。

- [ ] **Step 4: 实现快照 codec**

导出格式：

```js
{
  schemaVersion: 1,
  databaseName: 'palis-local-verification-v1',
  exportedAt: 'ISO-8601',
  checksum: 'sha256(canonical payload)',
  payload,
}
```

Blob 转为 `{name,type,size,sha256,base64}`；导入校验后恢复 Blob。schema、databaseName、checksum、state shape 任一错误都不得修改原库。

测试必须逐字节比较附件、MIME 和名称，并断言导出 JSON 不含创建或重置时输入的测试密码。

- [ ] **Step 5: 运行 repository conformance**

Run:

```text
node --test tests/local-indexeddb-browser.test.mjs
npm test
```

Expected: IndexedDB repository 通过 C01 conformance；浏览器/server teardown 后无残留进程。

- [ ] **Step 6: 提交**

Commit: `feat: persist local archive workflow in IndexedDB`

---

### Task 6: C04 静态可裁剪的本地管理员运行时

**Files:**
- Create: `src/runtime/palis-runtime-policy.js`
- Create: `src/runtime/palis-runtime.js`
- Create: `src/archive-workflow/local/local-admin-runtime.js`
- Create: `scripts/dev-local-admin.mjs`
- Create: `tests/palis-runtime.test.mjs`
- Create: `tests/local-runtime-browser.test.mjs`
- Modify: `src/main.js`
- Modify: `src/archive-workflow/workspace.js`

**Interfaces:**
- Produces: `isLoopbackHostname(hostname) -> boolean`
- Produces: `shouldEnableLocalAdmin({dev,hostname,explicit}) -> boolean`
- Produces: `initializePalisRuntime({reducedMotion}) -> Promise<Runtime>`
- Runtime: `{mode,repository,supabase,initialSession,activate}`
- Workspace: `initializeArchiveWorkspace({client,roots,initialSession})`

- [ ] **Step 1: 写三重条件与 IPv6 RED**

```js
const base = { dev: true, hostname: '127.0.0.1', explicit: true };
assert.equal(shouldEnableLocalAdmin(base), true);
assert.equal(shouldEnableLocalAdmin({ ...base, dev: false }), false);
assert.equal(shouldEnableLocalAdmin({ ...base, explicit: false }), false);
assert.equal(isLoopbackHostname('::1'), true);
assert.equal(isLoopbackHostname('[::1]'), true);
assert.equal(isLoopbackHostname('preview.example'), false);
```

Run: `node --test tests/palis-runtime.test.mjs`

Expected: FAIL，policy 不存在。

- [ ] **Step 2: 实现纯 policy**

policy 文件不得 import auth、Supabase 或 local repository。空 hostname、后缀伪装 `localhost.example` 和 `127.0.0.1.example` 必须返回 false。

- [ ] **Step 3: 写 initialSession 与启动顺序 RED**

本地 runtime 必须返回：

```js
{
  session: null,
  profile: {
    id: 'local-admin',
    display_name: '本地管理员',
    role: 'admin',
    enabled: true,
  },
  role: 'admin',
  preview: false,
}
```

测试用 spy 证明 `initializeArchiveWorkspace(...initialSession)` 先发生，`runtime.activate()` 后发生；事件不得在 listener 创建前丢失。

- [ ] **Step 4: 实现可静态消除的 runtime**

`palis-runtime.js` 必须使用直接外层分支：

```js
if (import.meta.env.DEV) {
  const explicit = import.meta.env.VITE_PALIS_LOCAL_ADMIN === '1';
  if (explicit && isLoopbackHostname(location.hostname)) {
    const { createLocalAdminRuntime } = await import(
      '../archive-workflow/local/local-admin-runtime.js'
    );
    return createLocalAdminRuntime(options);
  }
  if (explicit) throw new Error('Local administrator requires a loopback origin');
}
```

生产 auth/client 也在 production 分支动态 import。`main.js` 删除对 `auth.js` 和 `client.js` 的静态 import。

本地初始化失败必须 fail closed，不回退 Supabase。

- [ ] **Step 5: 修改 workspace 接口**

`initializeArchiveWorkspace` 在注册 listener 后立即 `applySession(initialSession)`。fallback 只把 `accessMode === "preview"` 或 `"locked"` 判为 preview；`local-admin` 不得重新锁死。

启动顺序固定：

```js
const runtime = await initializePalisRuntime({ reducedMotion });
initializeArchiveWorkspace({
  client: runtime.repository,
  initialSession: runtime.initialSession,
});
runtime.activate();
```

- [ ] **Step 6: 实现无 `.env.local-admin` 的启动器**

`scripts/dev-local-admin.mjs` 在创建 Vite server 前设置当前 Node process 的 `VITE_PALIS_LOCAL_ADMIN=1`，绑定 `127.0.0.1`，打印实际 URL，并在 SIGINT/SIGTERM 关闭 server。不得提交被 `.gitignore` 忽略的 env 文件。

`package.json`：

```json
"dev:local-admin": "node scripts/dev-local-admin.mjs"
```

- [ ] **Step 7: 真实浏览器验证**

`local-runtime-browser.test.mjs` 自启随机端口并断言：

- 不显示登录表单。
- `body.dataset.accessMode === "local-admin"`。
- workspace context/profile 为 `local-admin/admin/preview:false`。
- 管理员入口可打开。
- 未创建 Supabase client，外部请求为 0。
- production policy 未启用时仍显示原 access gate。

Run:

```text
node --test tests/palis-runtime.test.mjs tests/local-runtime-browser.test.mjs
npm test
```

Expected: 0 failures。

- [ ] **Step 8: 提交**

Commit: `feat: add loopback-only local administrator runtime`

---

### Task 7: C05 本地验证面板与默认生产门禁

**Files:**
- Create: `src/archive-workflow/local/local-fixtures.js`
- Create: `src/archive-workflow/local/local-verification-panel.js`
- Create: `src/archive-workflow/local/local-verification-panel.css`
- Create: `scripts/verify-local-admin.mjs`
- Create: `scripts/assert-production-safe.mjs`
- Create: `tests/production-safe.test.mjs`
- Create: `tests/production-bundle-safety.test.mjs`
- Create: `tests/local-admin-browser.test.mjs`
- Modify: `src/archive-workflow/local/local-admin-runtime.js`
- Modify: `src/archive-workflow/workspace.js` only if a generic, local-agnostic `registerUtility()` hook is required
- Modify: `package.json`

**Forbidden static edits:**

- `index.html` 不得加入 DEV markup、ID 或文案。
- `workspace.css` 不得加入 local panel selector。
- `workspace.js` 不得静态 import local panel、fixtures 或 CSS。

**Interfaces:**
- Produces: DEV-01—DEV-07 runtime panel
- Produces: `assertSourceSecrets(root)` and `assertProductionDist(dist)`
- Produces: `npm run verify:local`
- Default `npm run build` includes source secret preflight and dist scan

- [ ] **Step 1: 写扫描器 RED**

临时目录测试：

```js
await assert.doesNotReject(assertProductionDist(safeDist));
await assert.rejects(assertProductionDist(distWith('palis-local-verification-v1')));
await assert.rejects(assertProductionDist(distWithFile('local-fixtures.js')));
await assert.rejects(assertSourceSecrets(sourceWith('Service_Role_Key')));
await assert.rejects(assertSourceSecrets(sourceWithJwtPayload({ role: 'service_role' })));
```

日志只能打印文件路径与规则名，不得打印 JWT 或密钥值。

Run: `node --test tests/production-safe.test.mjs`

Expected: FAIL，扫描器不存在。

- [ ] **Step 2: 实现两种扫描模式**

`assertSourceSecrets` 只查 secret/JWT，跳过 `.git/node_modules/dist/tmp/supabase/.temp`。`assertProductionDist` 同时扫描文件名和文本内容，将内容转小写并移除空格、`_`、`-` 后匹配：

```text
palislocalverificationv1
vitepalislocaladmin
localadmin
localfixtures
localverificationpanel
dev01
failinjection
servicerole
```

二进制文件只扫文件名；文本文件扫内容。CLI 只设置 `process.exitCode`，import 时不得退出 test runner。

- [ ] **Step 3: 让默认 build 不可绕过**

`package.json`：

```json
{
  "build": "node scripts/assert-production-safe.mjs --source-secrets . && vite build && node scripts/assert-production-safe.mjs --dist dist",
  "build:safe": "npm run build",
  "assert:production-safe": "node scripts/assert-production-safe.mjs --dist dist"
}
```

测试读取 `package.json` 并断言默认 `build` 包含两道扫描；再真实执行一次 production build 到临时 outDir，断言没有 local JS/CSS chunk 且 production access gate 仍可启动。

- [ ] **Step 4: 写本地面板 RED**

本地 fixture 包含：

- 九类各一份正式档案。
- 科考站和白幕入口各一份。
- 事件计数器 26。
- 一份退回件、受限、封存和离线档案。
- 长标题、超长自定义词条、失效引用和 5MB 附件边界。

浏览器先断言 DEV-01 不存在，再实现后要求 DEV-01—DEV-07 全部可见。

- [ ] **Step 5: 实现 DEV-only panel**

`local-admin-runtime.js` 静态 import panel、fixtures 和 panel CSS；该 runtime 只能由 C04 的 DEV 动态分支触达。面板 DOM 运行时创建。

按钮逻辑：

| ID | Action |
|---|---|
| DEV-01 | 只读显示 `LOCAL ADMIN / 本地管理员` 与数据库名 |
| DEV-02 | alertdialog 确认后 reset 当前 PALIS local DB |
| DEV-03 | 导出含 checksum 的完整快照 |
| DEV-04 | 先校验再单事务导入；失败保持原库 |
| DEV-05 | admin/clerk/observer 权限预演，同时改变 workspace session 与 engine principal |
| DEV-06 | 设置仅内存 failpoint；刷新清空 |
| DEV-07 | 显示本地附件数量/体积，确认后仅清除 local attachments |

危险操作初始焦点放“取消”，关闭后焦点回触发按钮。错误在按钮附近 `aria-live="polite"`，请求期间只禁用当前按钮。

- [ ] **Step 6: 写并跑完整本地流程**

`local-admin-browser.test.mjs` 自启随机端口：

1. 无登录进入管理员工作台。
2. 新建事件 draft，保存、提交、批准、发布。
3. 事件业务 code 为 `EV27`，正式序号为 `027.RLL`。
4. 署名快照含本地管理员与 `VER 0.1 / 白幕初垂`。
5. 新事件出现在事件 indexEntries。
6. clerk 预演拒绝 station/entrance 新建。
7. 恢复 admin 后权限立即恢复。
8. failpoint 刷新后清空，业务 IndexedDB 数据仍存在。
9. 全过程只请求当前 loopback origin。

Run:

```text
node --test tests/production-safe.test.mjs tests/production-bundle-safety.test.mjs tests/local-admin-browser.test.mjs
npm test
npm run verify:local
npm run build
```

Expected: 全部 exit 0；默认 build 的 dist 文件名与内容均无 local sentinel。

- [ ] **Step 7: 视觉与生产隔离对账**

运行 C00 current capture，不覆盖 baseline。公开首页与九类目录稳定区域差异 ≤0.5%；本地管理员面板只出现在 local runtime 截图。

检查 production dist 文件列表，确认无 local JS chunk、local CSS asset、DEV-01—07、数据库名或 fixture sentinel。

- [ ] **Step 8: 提交**

Commit: `feat: add safe local PALIS verification runtime`

---

## Foundation Completion Gate

C00–C05 只有同时满足以下证据才算完成：

1. fresh `npm test` 完整计数与 0 failures。
2. fresh 默认 `npm run build` 完成 source secret preflight、Vite build 和 dist scan。
3. `npm run verify:local` 完整流程与 0 外部请求。
4. 本地管理员无登录进入截图。
5. `EV27` 明确标注为事件业务 code，同时显示正式序号 `027.RLL`。
6. 提交署名快照显示 `本地管理员 / VER 0.1 / 白幕初垂`。
7. 六个发布 failpoint 的 state 与 commit count 均未变化。
8. baseline/current 为两个 manifest，九类稳定区域差异 ≤0.5%。
9. production dist 文件列表证明没有本地 JS/CSS chunk。
10. 未触碰生产数据库、Supabase 项目或 Cloudflare 部署。

基础层通过后，继续执行独立的“可扩展档案工作流”“九类索引与迁移”“PALIS × Win95 工作台”实施计划；不得在未写对应计划前直接修改这些业务与视觉区域。
