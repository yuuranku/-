# PALIS Unified Archive Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn all nine archive editors into one clear PALIS document flow inside the Win95 application window while preserving every existing template field, draft, media, permission, review, publication, and public-layout contract.

**Architecture:** The parent workspace remains the single owner of index, references, media, attachments, attribution, autosave, and submission. The existing same-origin iframe remains the owner of each category’s structured dossier fields, but a focused embed-layout helper hides standalone controls, reports height/sections, and removes nested scrolling. Explicit index mappings become the sole visible input source for duplicated fields.

**Tech Stack:** Vanilla JavaScript ES modules, same-origin iframe DOM bridge, CSS, ResizeObserver, requestAnimationFrame, Node test runner, Puppeteer Core, Vite.

## Global Constraints

- Execute after `docs/superpowers/plans/2026-07-29-palis-win95-workspace-shell.md`.
- The outer PALIS home page, nine public directories, formal archive details, art layout, and motion must not change.
- Win95 owns application chrome; PALIS owns the entire editor client area.
- `EditorDocument v2` keys `values`, `indexData`, `sections`, `fieldLabels`, `references`, and `media` remain unchanged.
- The nine templates retain every `[data-save]`, `.sect`, and `.sect-label` contract.
- `public/templates/01–09*.html` and `public/templates/10-自由修订补充页.html` must not be edited.
- The editor has one main scroll container and no permanent left/right split or iframe scrollbar.
- The visible order is index, original dossier body, references, conditional media, attachments, attribution, and sticky actions.
- Title, station/entrance coordinates, species class, and event start date have one primary input location in the index section.
- Person and event retain their existing bounded image slots; the other seven categories render no empty media editor.
- New archive, contribution, and amendment keep distinct semantics.
- Clerk station/entrance editors remain amendment-only; administrators can create all nine.
- Local autosave stays at no more than 800ms and cloud autosave stays at 5s.
- No database migration, Supabase request shape, archive numbering, index projection, or publication renderer is changed.

## File Responsibility Map

- `src/archive-workflow/workspace.js`: unified editor markup, mode/target controls, index mappings, section outline, autosave/submission state, shell dirty-state events.
- `src/archive-workflow/workspace.css`: single-scroll PALIS client area, auxiliary sections, sticky outline/actions, responsive behavior.
- `src/archive-workflow/autosave.js`: inherited unchanged from the shell plan; its exact-generation event feeds editor dirty state.
- `src/archive-workflow/editor-bridge.js`: template read/write, synchronized-field locking, embed-layout lifecycle.
- `src/archive-workflow/editor-embed-layout.js`: injected embed presentation, height measurement, section outline, observer/animation-frame cleanup.
- `tests/archive-editor-embed-layout.test.mjs`: pure embed-layout lifecycle.
- `tests/archive-editor-bridge.test.mjs`: bridge integration and read-only synchronized fields.
- `tests/archive-autosave.test.mjs`: inherited shell regression coverage; rerun through the full suite.
- `tests/clerk-workflow-ui.test.mjs`: editor structure, modes, roles, media, and source contracts.
- `tests/workspace-ux-regression.test.mjs`: one-scroll and responsive CSS contracts.
- `tests/local-admin-runtime-browser.test.mjs`: updated archive-cabinet opening path.
- `tests/unified-archive-editor-browser.test.mjs`: nine-category real-browser acceptance.

---

### Task 1: Reorder the editor into one semantic document flow

**Files:**

- Modify: `src/archive-workflow/workspace.js:620-790`
- Modify: `tests/clerk-workflow-ui.test.mjs:52-71`
- Modify: `tests/workspace-ux-regression.test.mjs:34-57`

**Interfaces:**

- Consumes: `renderArchiveIndexFields()`, `renderArchiveMediaEditor()`, and the existing iframe URL.
- Produces: `[data-editor-scroll]` and ordered `[data-editor-section]` values `index`, `document`, `references`, `media`, `attachments`, `attribution`.
- Produces: `[data-editor-outline]`, `[data-editor-outline-select]`, and `[data-editor-submission-state="editing"]`.

- [ ] **Step 1: Write failing structural tests**

Replace the “right-side dossier” test with:

```js
test('all archive editors use one ordered PALIS document flow', () => {
  assert.match(workspace, /data-editor-scroll/);
  const index = workspace.indexOf('data-editor-section="index"');
  const document = workspace.indexOf('data-editor-section="document"');
  const references = workspace.indexOf('data-editor-section="references"');
  const media = workspace.indexOf('data-editor-section="media"');
  const attachments = workspace.indexOf('data-editor-section="attachments"');
  const attribution = workspace.indexOf('data-editor-section="attribution"');
  assert.ok(index < document);
  assert.ok(document < references);
  assert.ok(references < media);
  assert.ok(media < attachments);
  assert.ok(attachments < attribution);
  assert.match(workspace, /data-template-editor-frame/);
  assert.doesNotMatch(workspace, /archive-editor__workflow-rail/);
});
```

Replace the narrow split assertion in `tests/workspace-ux-regression.test.mjs`:

```js
test('archive editor exposes one main scroll path on desktop and narrow screens', () => {
  assert.match(workspace, /data-editor-scroll/);
  assert.match(workflowStyles, /\.archive-editor__content\s*\{[^}]*overflow-y:\s*auto/s);
  assert.doesNotMatch(workflowStyles, /\.archive-editor__split/);
  const narrow = workflowStyles.slice(workflowStyles.indexOf('@media (max-width: 760px)'));
  assert.doesNotMatch(
    narrow,
    /\.archive-editor__content\s*\{[^}]*(?:max-height|height):\s*72vh/s,
  );
});
```

- [ ] **Step 2: Run tests and verify the split-layout failure**

Run:

```powershell
node --test tests/clerk-workflow-ui.test.mjs tests/workspace-ux-regression.test.mjs
```

Expected: FAIL because `.archive-editor__split` and `.archive-editor__workflow-rail` still define the editor.

- [ ] **Step 3: Rebuild `createEditor()` markup without changing handlers**

Compute the optional media section once before building the form:

```js
const mediaEditorMarkup = renderArchiveMediaEditor(
  template.category,
  initial.content?.media,
);
```

Use this parent structure:

```html
<form class="archive-editor" data-archive-editor
  data-editor-submission-state="editing" novalidate>
  <header class="archive-editor__toolbar">
    <label>编录方式
      <select name="kind">
        <option value="new">新建档案</option>
        <option value="contribution">补充同一档案</option>
        <option value="amendment">提交修改申请</option>
      </select>
    </label>
    <label>正式档号
      <output data-formal-number>
        ${escapeHtml(initial.formalNumber || '审核录入时自动分配')}
      </output>
    </label>
    <input type="hidden" name="targetContributionId" />
    <output class="archive-autosave-status"
      data-autosave-status data-state="local-saved">等待编辑</output>
  </header>
  <aside class="archive-recovery" data-recovery hidden>
    <div><b>发现未提交的暂存内容</b>
      <span data-recovery-copy>可以恢复本地暂存，或保留当前云端版本。</span>
    </div>
    <button type="button" data-recovery-local>恢复本地暂存</button>
    <button type="button" data-recovery-cloud>使用云端版本</button>
    <button type="button" data-recovery-dismiss>忽略</button>
  </aside>
  <nav class="archive-editor__outline" data-editor-outline aria-label="档案分区">
    <button type="button" data-editor-outline-target="index">
      00 索引登记 <output data-editor-outline-error="index" hidden></output>
    </button>
    <button type="button" data-editor-outline-target="document">
      档案正文 <output data-editor-outline-error="document" hidden></output>
    </button>
    <span data-editor-template-outline></span>
    <button type="button" data-editor-outline-target="references">关联材料</button>
    ${mediaEditorMarkup
      ? '<button type="button" data-editor-outline-target="media">版面图片</button>'
      : ''}
    <button type="button" data-editor-outline-target="attachments">补充附件</button>
    <button type="button" data-editor-outline-target="attribution">归档责任</button>
    <select data-editor-outline-select aria-label="跳转到档案分区">
      <option value="index">00 索引登记</option>
      <option value="document">档案正文</option>
      <optgroup label="正文分区" data-editor-template-outline-options></optgroup>
      <option value="references">关联材料</option>
      ${mediaEditorMarkup ? '<option value="media">版面图片</option>' : ''}
      <option value="attachments">补充附件</option>
      <option value="attribution">归档责任</option>
    </select>
  </nav>
  <div class="archive-editor__content" data-editor-scroll>
    <section class="archive-editor__section" data-editor-section="index">
      <div class="archive-editor__registration">
        <span>PALIS / TEMPLATE ${escapeHtml(template.code)} /
          ${escapeHtml(template.abbreviation)}</span>
        <b>VER 0.1 / 白幕初垂 / 待录入</b>
      </div>
      <p class="archive-editor__instruction">
        先完成目录索引，再沿同一页面填写原版设定卡；正式输出继续使用原档案排版。
      </p>
      ${renderArchiveIndexFields(template.category, {
        ...(initial.content?.indexData ?? {}),
        title: initial.content?.indexData?.title || initial.title || '',
      })}
      <section class="archive-editable-picker"
        data-editable-archive-picker hidden>
        <header>
          <b>选择要补充或修改的档案</b>
          <button type="button" data-refresh-editable-archives>刷新列表</button>
        </header>
        <label><span>可编辑档案</span>
          <select name="archiveId"><option value="">请选择档案</option></select>
        </label>
        <p data-editable-archive-status>
          切换为补充或修改后，从当前可见档案中选择。
        </p>
        <div class="archive-target-document-picker"
          data-target-document-picker hidden>
          <label><span>要修改的具体文档</span>
            <select name="targetDocumentId">
              <option value="">请先选择上方档案</option>
            </select>
          </label>
          <p data-target-document-status>
            修改申请必须指向一份具体文档；不会新建同级记录。
          </p>
        </div>
      </section>
    </section>
    <section
      class="archive-editor__section archive-editor__section--document archive-editor__canvas is-loading"
      data-editor-section="document" aria-busy="true">
      <header><b>档案正文 / DOSSIER BODY</b>
        <a href="${templatePreviewUrl(template)}" target="_blank"
          rel="noopener">单独打开</a>
      </header>
      <div class="archive-editor__document-errors"
        data-document-errors role="alert" hidden></div>
      <div class="archive-editor__frame">
        <div class="archive-editor__loading" data-template-editor-loading role="status">
          <b>正在载入设定卡</b><span>首次打开会准备可编辑档案版式</span>
        </div>
        <aside data-template-height-fallback role="alert" hidden>
          <b>正文未能完成嵌入</b>
          <p>索引与已保存草稿仍可使用。可重新载入正文，或单独打开模板。</p>
          <button type="button" data-reload-template>重新载入正文</button>
          <a href="${templatePreviewUrl(template)}" target="_blank" rel="noopener">
            单独打开
          </a>
        </aside>
        <div class="archive-slash-reference-menu"
          data-slash-reference-menu hidden></div>
        <iframe data-template-editor-frame
          src="${editorPreviewUrl(template, initialKind)}"
          title="${escapeHtml(template.title)}录入编辑器"></iframe>
      </div>
    </section>
    <section class="archive-editor__section" data-editor-section="references">
      <section class="archive-reference-editor">
        <header>
          <div><b>关联档案与引用</b>
            <span>引用会在公开档案中变为可点击窗口</span>
          </div>
          <div data-reference-search>
            <input name="referenceQuery"
              placeholder="检索人物、事件、物种或编号" />
            <button type="button" data-reference-search-submit>检索引用</button>
          </div>
        </header>
        <div class="archive-reference-results"
          data-reference-results hidden></div>
        <ul data-reference-list>
          <li class="is-empty">尚未引用其他档案</li>
        </ul>
      </section>
    </section>
    ${mediaEditorMarkup ? `
      <section class="archive-editor__section" data-editor-section="media">
        ${mediaEditorMarkup}
      </section>
    ` : ''}
    <section class="archive-editor__section" data-editor-section="attachments">
      <label class="archive-editor-field">
        <span>补充附件（不进入档案图片版面，单个文件不超过 5MB）</span>
        <input name="attachments" type="file" multiple
          accept=".html,.doc,.docx,.pdf,.txt,image/*" />
      </label>
    </section>
    <section class="archive-editor__section" data-editor-section="attribution">
      <dl class="archive-editor__attribution">
        <div><dt>档案提交者</dt>
          <dd data-submitter>${escapeHtml(profileName)}</dd>
        </div>
        <div data-modifier-row hidden><dt>档案修改者</dt>
          <dd data-modifier>${escapeHtml(profileName)}</dd>
        </div>
      </dl>
    </section>
  </div>
  <footer class="archive-editor__footer">
    <p data-editor-message>
      内容会先保存到本机；停止输入 5 秒后再同步云端。
    </p>
    <button type="button" data-save-now>立即暂存</button>
    <button type="submit" data-submit-draft>提交审核</button>
  </footer>
</form>
```

Keep all current `name`, `data-*`, and query selectors so the existing event handlers continue to resolve the same controls.

- [ ] **Step 4: Add minimal one-flow CSS and rerun tests**

Replace split declarations with:

```css
.archive-editor {
  grid-template-areas:
    'toolbar'
    'recovery'
    'outline'
    'content'
    'footer';
  grid-template-rows: auto auto auto minmax(0, 1fr) auto;
}

.archive-editor__outline { grid-area: outline; }
.archive-editor__content {
  grid-area: content;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.archive-editor__section { min-width: 0; }
.archive-editor__section--document iframe {
  display: block;
  width: 100%;
  border: 0;
}
```

Run:

```powershell
node --test tests/clerk-workflow-ui.test.mjs tests/workspace-ux-regression.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit the one-flow structure**

```powershell
git add -- src/archive-workflow/workspace.js src/archive-workflow/workspace.css tests/clerk-workflow-ui.test.mjs tests/workspace-ux-regression.test.mjs
git commit -m "feat: make archive editors a single document flow"
```

---

### Task 2: Add a tested embed-layout helper for height and section reporting

**Files:**

- Create: `src/archive-workflow/editor-embed-layout.js`
- Create: `tests/archive-editor-embed-layout.test.mjs`
- Modify: `src/archive-workflow/editor-bridge.js`
- Modify: `tests/archive-editor-bridge.test.mjs`

**Interfaces:**

- Produces: `createEditorEmbedLayout(options): EditorEmbedLayout`.
- Options: `{ root, onHeightChange, onOutlineChange, onError, schedule, cancelSchedule }`.
- `EditorEmbedLayout`: `{ measure(): number, getSectionOutline(): SectionOutline[], dispose(): void }`.
- `SectionOutline`: `{ id: string, label: string, offsetTop: number }`.
- `createTemplateEditorBridge()` gains options `embedded`, `onHeightChange`, `onOutlineChange`, and `onLayoutError`.

- [ ] **Step 1: Write failing embed-layout tests**

Create `tests/archive-editor-embed-layout.test.mjs` with fake DOM objects that expose `documentElement`, `head`, `body`, `querySelector`, `querySelectorAll`, and `defaultView.ResizeObserver`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import { createEditorEmbedLayout } from '../src/archive-workflow/editor-embed-layout.js';

const createEmbedFixture = ({
  height = 1200,
  sections = [],
  deferSchedule = false,
} = {}) => {
  const styles = [];
  const sectionNodes = sections.map(({ label, top }) => ({
    id: '',
    querySelector: (selector) => selector === '.sect-label'
      ? { textContent: label }
      : null,
    getBoundingClientRect: () => ({ top }),
  }));
  const contentRoot = {
    scrollHeight: height,
    getBoundingClientRect: () => ({ top: 0 }),
  };
  const fixture = {
    root: null,
    styles,
    observer: null,
    pending: null,
    deferSchedule,
  };
  const root = {
    documentElement: { dataset: {}, scrollHeight: height },
    body: { scrollHeight: height },
    head: { append: (style) => styles.push(style) },
    defaultView: {},
    getElementById: (id) => styles.find((style) => style.id === id) || null,
    createElement: () => ({ id: '', textContent: '' }),
    querySelector: (selector) => selector === '#doc' ? contentRoot : null,
    querySelectorAll: (selector) => selector === '.sect' ? sectionNodes : [],
  };
  root.defaultView.ResizeObserver = class {
    constructor(callback) {
      this.callback = callback;
      this.disconnected = false;
      fixture.observer = this;
    }
    observe(target) {
      this.target = target;
    }
    disconnect() {
      this.disconnected = true;
    }
  };
  fixture.root = root;
  return fixture;
};

test('embed layout marks the document, injects one style, and reports height', () => {
  const fixture = createEmbedFixture({ height: 4320 });
  const heights = [];
  const layout = createEditorEmbedLayout({
    root: fixture.root,
    onHeightChange: (height) => heights.push(height),
    schedule: (callback) => { callback(); return 1; },
    cancelSchedule: () => {},
  });
  assert.equal(fixture.root.documentElement.dataset.palisWorkspaceEmbed, 'true');
  assert.equal(fixture.styles.length, 1);
  assert.equal(layout.measure(), 4320);
  assert.equal(heights.at(-1), 4320);
  layout.dispose();
});

test('embed layout returns deterministic section labels and offsets', () => {
  const fixture = createEmbedFixture({
    sections: [
      { label: '身份资料 / IDENTITY', top: 120 },
      { label: '履历 / HISTORY', top: 840 },
    ],
  });
  const layout = createEditorEmbedLayout({
    root: fixture.root,
    schedule: (callback) => { callback(); return 1; },
    cancelSchedule: () => {},
  });
  assert.deepEqual(layout.getSectionOutline(), [
    { id: 'palis-section-01', label: '身份资料 / IDENTITY', offsetTop: 120 },
    { id: 'palis-section-02', label: '履历 / HISTORY', offsetTop: 840 },
  ]);
  layout.dispose();
});

test('dispose disconnects ResizeObserver and cancels queued measurement', () => {
  const fixture = createEmbedFixture({ height: 1500, deferSchedule: true });
  const cancelled = [];
  const layout = createEditorEmbedLayout({
    root: fixture.root,
    schedule: (callback) => { fixture.pending = callback; return 77; },
    cancelSchedule: (id) => cancelled.push(id),
  });
  layout.dispose();
  assert.equal(fixture.observer.disconnected, true);
  assert.deepEqual(cancelled, [77]);
});

test('invalid height enables a reachable iframe-scroll fallback', () => {
  const fixture = createEmbedFixture({ height: 0 });
  const errors = [];
  const layout = createEditorEmbedLayout({
    root: fixture.root,
    onError: (error) => errors.push(error),
    schedule: (callback) => { callback(); return 1; },
    cancelSchedule: () => {},
  });
  assert.equal(layout.measure(), 0);
  assert.equal(
    fixture.root.documentElement.dataset.palisWorkspaceEmbedError,
    'true',
  );
  assert.equal(errors.at(-1) instanceof RangeError, true);
  layout.dispose();
});
```

Keep this fixture in the test file; it deliberately avoids adding jsdom or any
runtime dependency.

- [ ] **Step 2: Run the new test and verify missing module failure**

Run:

```powershell
node --test tests/archive-editor-embed-layout.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the focused embed-layout module**

Create:

```js
const EMBED_STYLE_ID = 'palis-workspace-embed-styles';
const normalizeText = (value) => String(value ?? '').replaceAll(/\s+/g, ' ').trim();

export const createEditorEmbedLayout = ({
  root,
  onHeightChange = () => {},
  onOutlineChange = () => {},
  onError = () => {},
  schedule = (callback) => root.defaultView.requestAnimationFrame(callback),
  cancelSchedule = (id) => root.defaultView.cancelAnimationFrame(id),
} = {}) => {
  if (!root?.documentElement || !root?.body) {
    throw new TypeError('An embedded template document is required');
  }

  root.documentElement.dataset.palisWorkspaceEmbed = 'true';
  if (!root.getElementById?.(EMBED_STYLE_ID)) {
    const style = root.createElement('style');
    style.id = EMBED_STYLE_ID;
    style.textContent = `
      html[data-palis-workspace-embed='true'],
      html[data-palis-workspace-embed='true'] body {
        overflow: hidden !important;
        background: #3a3226;
      }
      html[data-palis-workspace-embed='true'] .actionbar.no-print {
        display: none !important;
      }
      html[data-palis-workspace-embed-error='true'],
      html[data-palis-workspace-embed-error='true'] body {
        overflow: auto !important;
      }
      html[data-palis-workspace-embed='true'] [data-index-synchronized='true'] {
        position: relative;
        outline: 1px dashed rgba(217, 167, 59, .72);
        outline-offset: 3px;
      }
      html[data-palis-workspace-embed='true'] [data-index-synchronized='true']::after {
        content: attr(data-index-synchronized-label);
        position: absolute;
        top: 0;
        right: 0;
        white-space: nowrap;
        pointer-events: none;
        transform: translateY(-115%);
        color: #d9a73b;
        font: 600 10px/1.4 "IBM Plex Mono", monospace;
      }
    `;
    root.head.append(style);
  }

  const contentRoot = root.querySelector('#doc') || root.querySelector('main') || root.body;
  let frame = null;
  let disposed = false;

  const getSectionOutline = () => [...root.querySelectorAll('.sect')].map((section, index) => {
    const id = section.id || `palis-section-${String(index + 1).padStart(2, '0')}`;
    section.id = id;
    return {
      id,
      label: normalizeText(section.querySelector('.sect-label')?.textContent)
        || `档案分区 ${String(index + 1).padStart(2, '0')}`,
      offsetTop: Math.max(0, Math.round(
        section.getBoundingClientRect().top - contentRoot.getBoundingClientRect().top,
      )),
    };
  });

  const measure = () => {
    frame = null;
    if (disposed) return 0;
    const height = Math.ceil(Math.max(
      root.documentElement.scrollHeight || 0,
      root.body.scrollHeight || 0,
      contentRoot.scrollHeight || 0,
    ));
    if (!Number.isFinite(height) || height < 1) {
      root.documentElement.dataset.palisWorkspaceEmbedError = 'true';
      onError(new RangeError('Embedded template height is unavailable'));
      return 0;
    }
    delete root.documentElement.dataset.palisWorkspaceEmbedError;
    onHeightChange(height);
    onOutlineChange(getSectionOutline());
    return height;
  };

  const queue = () => {
    if (disposed || frame !== null) return;
    frame = schedule(measure);
  };

  const Observer = root.defaultView?.ResizeObserver;
  const observer = Observer ? new Observer(queue) : null;
  observer?.observe(contentRoot);
  queue();

  return {
    measure,
    getSectionOutline,
    dispose() {
      if (disposed) return;
      disposed = true;
      observer?.disconnect();
      if (frame !== null) cancelSchedule(frame);
      frame = null;
    },
  };
};
```

- [ ] **Step 4: Mount and dispose it through the editor bridge**

Import the helper and add these options to the existing
`createTemplateEditorBridge()` parameter destructuring, immediately after
`waitForLoad`:

```js
embedded = false,
onHeightChange = () => {},
onOutlineChange = () => {},
onLayoutError = () => {},
```

Declare `embedLayout` beside `observer`, then create it inside `attach()` after
`installEditorPerformanceStyles(root)` and `writeTemplateDocument(...)`:

```js
let embedLayout = null;

if (embedded) {
  try {
    embedLayout = createEditorEmbedLayout({
      root,
      onHeightChange,
      onOutlineChange,
      onError: onLayoutError,
    });
  } catch (error) {
    onLayoutError(error);
  }
}
```

Expose:

```js
getSectionOutline() {
  return embedLayout?.getSectionOutline() ?? [];
},
measureEmbeddedHeight() {
  return embedLayout?.measure() ?? 0;
},
```

In `dispose()` call `embedLayout?.dispose()` before removing listeners. Add
this bridge test:

```js
test('embedded bridge marks the document and reports its measured height', async () => {
  const fixture = createFixture();
  const styles = [];
  const originalQuerySelector = fixture.root.querySelector;
  const originalQuerySelectorAll = fixture.root.querySelectorAll;
  const contentRoot = {
    scrollHeight: 2400,
    getBoundingClientRect: () => ({ top: 0 }),
  };
  Object.assign(fixture.root, {
    documentElement: { dataset: {}, scrollHeight: 2400 },
    body: { scrollHeight: 2400 },
    head: { append: (style) => styles.push(style) },
    getElementById: (id) => styles.find((style) => style.id === id) || null,
    createElement: () => ({ id: '', textContent: '' }),
    querySelector: (selector) =>
      selector === '#doc' ? contentRoot : originalQuerySelector(selector),
    querySelectorAll: (selector) =>
      selector === '.sect' ? [] : originalQuerySelectorAll(selector),
  });
  fixture.root.defaultView.requestAnimationFrame = (callback) => {
    callback();
    return 1;
  };
  fixture.root.defaultView.cancelAnimationFrame = () => {};
  const heights = [];
  const bridge = createTemplateEditorBridge({
    iframe: {
      contentDocument: fixture.root,
      contentWindow: fixture.root.defaultView,
      addEventListener() {},
      removeEventListener() {},
    },
    template: ARCHIVE_TEMPLATE_BY_CODE['07'],
    initialDocument: createEditorDocument(ARCHIVE_TEMPLATE_BY_CODE['07']),
    embedded: true,
    onHeightChange: (height) => heights.push(height),
  });
  await bridge.ready;
  assert.equal(
    fixture.root.documentElement.dataset.palisWorkspaceEmbed,
    'true',
  );
  assert.equal(heights.at(-1), 2400);
  bridge.dispose();
});
```

Run:

```powershell
node --test tests/archive-editor-embed-layout.test.mjs tests/archive-editor-bridge.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit the embed-layout bridge**

```powershell
git add -- src/archive-workflow/editor-embed-layout.js src/archive-workflow/editor-bridge.js tests/archive-editor-embed-layout.test.mjs tests/archive-editor-bridge.test.mjs
git commit -m "feat: add embedded template layout bridge"
```

---

### Task 3: Make explicit index fields the single editing source

**Files:**

- Modify: `src/archive-workflow/editor-bridge.js`
- Modify: `src/archive-workflow/workspace.js:930-1020`
- Modify: `tests/archive-editor-bridge.test.mjs`
- Modify: `tests/clerk-workflow-ui.test.mjs`

**Interfaces:**

- Produces: `bridge.setSynchronizedFields(descriptors): number`.
- Extends `bridge.writeFieldValue()` and `bridge.writeFieldByLabel()` with
  `{ notify?: boolean }`; index synchronization always passes
  `{ notify: false }` so one keystroke queues one autosave.
- Descriptor shape: `{ key: string }` or `{ label: string }`.
- Locked template nodes receive `data-index-synchronized`, `contenteditable="false"`, and `aria-readonly="true"`.

- [ ] **Step 1: Write failing synchronized-field tests**

Add to `tests/archive-editor-bridge.test.mjs`:

```js
test('index synchronized template fields remain readonly when the editor is otherwise editable', async () => {
  const fixture = createFixture();
  const iframe = {
    contentDocument: fixture.root,
    contentWindow: fixture.root.defaultView,
    addEventListener() {},
    removeEventListener() {},
  };
  const bridge = createTemplateEditorBridge({
    iframe,
    template: ARCHIVE_TEMPLATE_BY_CODE['07'],
    initialDocument: createEditorDocument(ARCHIVE_TEMPLATE_BY_CODE['07']),
  });
  await bridge.ready;
  assert.equal(bridge.setSynchronizedFields([{ key: 'hero' }]), 1);
  bridge.setReadOnly(false);
  assert.equal(fixture.hero.attributes.contenteditable, 'false');
  assert.equal(fixture.hero.attributes['aria-readonly'], 'true');
  assert.equal(fixture.hero.dataset.indexSynchronized, 'true');
  assert.equal(fixture.hero.dataset.indexSynchronizedLabel, '由目录索引同步');
  assert.equal(fixture.unknown.attributes.contenteditable, 'true');

  fixture.unknown.closest = () => ({
    querySelector: () => ({
      textContent: '发生时期 / PERIOD —— 可写年份，也可写模糊时期',
    }),
  });
  assert.equal(
    bridge.setSynchronizedFields([{ label: '发生时期 / PERIOD' }]),
    1,
  );
  assert.equal(fixture.hero.attributes.contenteditable, 'true');
  assert.equal(fixture.unknown.attributes.contenteditable, 'false');
  bridge.dispose();
});

test('silent index writes update the template without emitting a second change', async () => {
  const fixture = createFixture();
  const changes = [];
  const bridge = createTemplateEditorBridge({
    iframe: {
      contentDocument: fixture.root,
      contentWindow: fixture.root.defaultView,
      addEventListener() {},
      removeEventListener() {},
    },
    template: ARCHIVE_TEMPLATE_BY_CODE['07'],
    initialDocument: createEditorDocument(ARCHIVE_TEMPLATE_BY_CODE['07']),
    onChange: (document) => changes.push(document),
  });
  await bridge.ready;
  assert.equal(
    bridge.writeFieldValue('hero', '白幕初垂', { notify: false }),
    true,
  );
  assert.equal(fixture.hero.textContent, '白幕初垂');
  assert.equal(changes.length, 0);
  bridge.dispose();
});
```

Add a source-level mapping assertion:

```js
test('only explicit index mappings lock duplicate template fields', () => {
  assert.match(workspace, /setSynchronizedFields/);
  for (const key of [
    'hero',
    'f_5Z2Q5qCH',
    'f_5qSN54mp77yP5Yqo54mp77yP5aSN5ZCI576k6JC9',
    'f_5YR55Sf5pe25pyf',
  ]) {
    assert.match(workspace, new RegExp(key));
  }
  assert.doesNotMatch(workspace, /setSynchronizedFields\(\s*document\.fieldLabels/);
});
```

- [ ] **Step 2: Run tests and verify missing API failure**

Run:

```powershell
node --test tests/archive-editor-bridge.test.mjs tests/clerk-workflow-ui.test.mjs
```

Expected: FAIL because `setSynchronizedFields` does not exist.

- [ ] **Step 3: Implement exact descriptor locking**

Inside the bridge:

```js
const synchronizedElements = new Set();
let bridgeReadOnly = false;

const elementForDescriptor = (descriptor) => {
  if (descriptor.key) {
    return [...root.querySelectorAll('[data-save]')].find((candidate) =>
      String(candidate.dataset?.save ?? '').trim() === descriptor.key);
  }
  const label = normalizeLabel(descriptor.label);
  return [...root.querySelectorAll('[data-save]')].find((candidate) => {
    const candidateLabel = fieldLabel(candidate);
    return candidateLabel === label
      || candidateLabel.startsWith(label)
      || candidateLabel.includes(label);
  });
};

const setSynchronizedFields = (descriptors = []) => {
  if (!root) return 0;
  synchronizedElements.forEach((element) => {
    delete element.dataset.indexSynchronized;
    delete element.dataset.indexSynchronizedLabel;
  });
  synchronizedElements.clear();
  descriptors.forEach((descriptor) => {
    const element = elementForDescriptor(descriptor);
    if (!element) return;
    synchronizedElements.add(element);
    element.dataset.indexSynchronized = 'true';
    element.dataset.indexSynchronizedLabel = '由目录索引同步';
    element.setAttribute('contenteditable', 'false');
    element.setAttribute('aria-readonly', 'true');
  });
  setReadOnly(bridgeReadOnly);
  return synchronizedElements.size;
};
```

Replace `setReadOnly` so changing descriptor sets can also unlock fields that
are no longer synchronized:

```js
const setReadOnly = (readOnly) => {
  bridgeReadOnly = Boolean(readOnly);
  if (!root) return;
  root.querySelectorAll('[data-save]').forEach((element) => {
    const key = String(element?.dataset?.save ?? '').trim();
    const locked = bridgeReadOnly
      || ARCHIVE_SYSTEM_FIELD_SET.has(key)
      || synchronizedElements.has(element);
    element.setAttribute?.('contenteditable', locked ? 'false' : 'true');
    element.setAttribute?.('aria-readonly', String(locked));
  });
  const input = root.querySelector?.('#photoInput');
  if (input) input.disabled = bridgeReadOnly;
};
```

Expose `setSynchronizedFields` on the bridge API.

Pass write options through both bridge methods:

```js
writeFieldValue(key, value, options = {}) {
  if (!root) return false;
  const normalizedKey = String(key ?? '').trim();
  const element = [...root.querySelectorAll('[data-save]')]
    .find((candidate) =>
      String(candidate?.dataset?.save ?? '').trim() === normalizedKey);
  return writeElementValue(element, value, options);
},
writeFieldByLabel(label, value, options = {}) {
  if (!root) return false;
  const normalizedLabel = normalizeLabel(label);
  const element = [...root.querySelectorAll('[data-save]')].find((candidate) => {
    const candidateLabel = fieldLabel(candidate);
    return candidateLabel === normalizedLabel
      || candidateLabel.startsWith(normalizedLabel)
      || candidateLabel.includes(normalizedLabel);
  });
  return writeElementValue(element, value, options);
},
```

- [ ] **Step 4: Register mappings and remove reverse live synchronization**

In `workspace.js`, define:

```js
const SYNCHRONIZED_TEMPLATE_KEYS = Object.freeze({
  coordinate: 'f_5Z2Q5qCH',
  specimenClass: 'f_5qSN54mp77yP5Yqo54mp77yP5aSN5ZCI576k6JC9',
  eventStart: 'f_5YR55Sf5pe25pyf',
});

const synchronizedTemplateFields = () => {
  const descriptors = [{ key: 'hero' }];
  if (template.category === 'station' || template.category === 'entrance') {
    descriptors.push({ key: SYNCHRONIZED_TEMPLATE_KEYS.coordinate });
  }
  if (template.category === 'species') {
    descriptors.push({ key: SYNCHRONIZED_TEMPLATE_KEYS.specimenClass });
  }
  if (template.category === 'event') {
    descriptors.push({ key: SYNCHRONIZED_TEMPLATE_KEYS.eventStart });
  }
  return descriptors;
};
```

In `syncIndexFieldToTemplate()`, pass `{ notify: false }` to every
write and use `writeFieldValue()` with these same stable keys for coordinates,
species class, and event start. The parent input/change handler retains the
shell plan's single `queueDraftAutosave()` call, so one keystroke creates one
dirty generation.

After `editorBridge.ready`:

```js
editorBridge?.setSynchronizedFields(synchronizedTemplateFields());
Object.keys(editorDocument.indexData).forEach(syncIndexFieldToTemplate);
```

Stop calling `syncTemplateToIndex(document)` inside `onChange`. Once that call
is removed, delete the now-unused local functions `syncTemplateToIndex`,
`findDocumentValueByLabel`, and `parseCoordinateText`. Retain initial
normalization and explicit index-to-template writes.

Run:

```powershell
node --test tests/archive-editor-bridge.test.mjs tests/clerk-workflow-ui.test.mjs tests/archive-index-fields.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit single-source index mappings**

```powershell
git add -- src/archive-workflow/editor-bridge.js src/archive-workflow/workspace.js tests/archive-editor-bridge.test.mjs tests/clerk-workflow-ui.test.mjs
git commit -m "fix: make archive index fields the single editing source"
```

---

### Task 4: Wire iframe height, section navigation, loading fallback, and retry

**Files:**

- Modify: `src/archive-workflow/workspace.js:760-790`
- Modify: `src/archive-workflow/workspace.js:1280-1350`
- Modify: `src/archive-workflow/workspace.css`
- Modify: `tests/workspace-ux-regression.test.mjs`
- Modify: `tests/local-admin-runtime-browser.test.mjs`

**Interfaces:**

- Consumes: bridge options and methods from Task 2.
- Produces: iframe inline height in whole pixels.
- Produces: outline buttons/select options with `{ id, label, offsetTop }`.
- Produces: `[data-template-height-fallback]` and `[data-reload-template]`.

- [ ] **Step 1: Add failing layout/fallback tests**

Add source assertions:

```js
test('workspace bridge owns embedded height outline and retry fallback', () => {
  assert.match(workspace, /embedded:\s*true/);
  assert.match(workspace, /onHeightChange/);
  assert.match(workspace, /onOutlineChange/);
  assert.match(workspace, /data-template-height-fallback/);
  assert.match(workspace, /data-reload-template/);
  assert.match(workspace, /data-editor-outline-target/);
});
```

Add browser assertions after opening the event editor:

```js
const layout = await page.evaluate(() => {
  const frame = document.querySelector('[data-template-editor-frame]');
  const scroll = document.querySelector('[data-editor-scroll]');
  return {
    frameHeight: frame.getBoundingClientRect().height,
    frameScrollHeight: frame.contentDocument.documentElement.scrollHeight,
    frameOverflow: getComputedStyle(frame.contentDocument.documentElement).overflow,
    parentScrollable: scroll.scrollHeight > scroll.clientHeight,
    actionbarHidden: getComputedStyle(
      frame.contentDocument.querySelector('.actionbar'),
    ).display === 'none',
  };
});
assert.ok(Math.abs(layout.frameHeight - layout.frameScrollHeight) <= 4);
assert.equal(layout.frameOverflow, 'hidden');
assert.equal(layout.parentScrollable, true);
assert.equal(layout.actionbarHidden, true);
```

- [ ] **Step 2: Run focused tests and verify missing callbacks**

Run:

```powershell
node --test tests/workspace-ux-regression.test.mjs tests/local-admin-runtime-browser.test.mjs
```

Expected: FAIL because the bridge is not mounted in embedded mode and the iframe remains an internal scroller.

- [ ] **Step 3: Connect bridge layout callbacks**

Add state and callbacks near `mountEditorBridge()`:

```js
let editorOutline = [];
const editorScroll = form.querySelector('[data-editor-scroll]');
const outline = form.querySelector('[data-editor-outline]');
const outlineSelect = form.querySelector('[data-editor-outline-select]');
const outlineTemplateItems = form.querySelector('[data-editor-template-outline]');
const outlineTemplateOptions = form.querySelector(
  '[data-editor-template-outline-options]',
);
const heightFallback = form.querySelector('[data-template-height-fallback]');
let templateLoadTimeout = null;

const showTemplateFallback = () => {
  if (templateLoadTimeout !== null) clearTimeout(templateLoadTimeout);
  templateLoadTimeout = null;
  editorCanvas.classList.add('has-layout-error');
  editorCanvas.classList.remove('is-loading');
  templateFrame.style.height = '70vh';
  if (templateFrame.contentDocument?.documentElement) {
    templateFrame.contentDocument.documentElement.dataset
      .palisWorkspaceEmbedError = 'true';
  }
  heightFallback.hidden = false;
  editorCanvas.setAttribute('aria-busy', 'false');
  if (editorLoading) editorLoading.hidden = true;
};

const armTemplateLoadTimeout = () => {
  if (templateLoadTimeout !== null) clearTimeout(templateLoadTimeout);
  templateLoadTimeout = setTimeout(showTemplateFallback, 8_000);
};

const applyTemplateHeight = (height) => {
  if (!Number.isFinite(height) || height < 1) return;
  if (templateLoadTimeout !== null) clearTimeout(templateLoadTimeout);
  templateLoadTimeout = null;
  templateFrame.style.height = `${Math.ceil(height)}px`;
  if (templateFrame.contentDocument?.documentElement) {
    delete templateFrame.contentDocument.documentElement.dataset
      .palisWorkspaceEmbedError;
  }
  editorCanvas.classList.remove('has-layout-error');
  heightFallback.hidden = true;
};

const renderEditorOutline = (sections) => {
  editorOutline = sections;
  outlineTemplateItems.replaceChildren();
  outlineTemplateOptions.replaceChildren();
  sections.forEach((section, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.editorOutlineTarget = section.id;
    button.dataset.templateOutlineItem = '';
    button.textContent = `${String(index + 1).padStart(2, '0')} ${section.label}`;
    outlineTemplateItems.append(button);
    const option = document.createElement('option');
    option.value = section.id;
    option.dataset.templateOutlineItem = '';
    option.textContent = button.textContent;
    outlineTemplateOptions.append(option);
  });
};
templateFrame.addEventListener('error', showTemplateFallback);
```

Mount:

```js
armTemplateLoadTimeout();
editorBridge = createTemplateEditorBridge({
  iframe: templateFrame,
  template,
  initialDocument: editorDocument,
  embedded: true,
  onHeightChange: applyTemplateHeight,
  onOutlineChange: renderEditorOutline,
  onLayoutError: showTemplateFallback,
  onReferenceTrigger: runSlashReferenceSearch,
  onChange: (document) => {
    editorDocument = {
      ...document,
      indexData: editorDocument.indexData,
      references,
    };
    queueDraftAutosave();
  },
  waitForLoad,
});
const mountedBridge = editorBridge;
mountedBridge.ready.then((bridge) => {
  if (editorBridge !== mountedBridge) return;
  if (!bridge) {
    showTemplateFallback();
    return;
  }
  bridge.setSystemFields(editorDocument.values);
  bridge.setSynchronizedFields(synchronizedTemplateFields());
  Object.keys(editorDocument.indexData).forEach(syncIndexFieldToTemplate);
  editorCanvas.classList.remove('is-loading');
  editorCanvas.setAttribute('aria-busy', 'false');
  if (editorLoading) editorLoading.hidden = true;
});
```

- [ ] **Step 4: Implement navigation and retry**

Place the following block after the `mountEditorBridge` function definition
but before its first `mountEditorBridge()` call. Use one parent-scroll
calculation:

```js
const editorScrollBehavior = matchMedia('(prefers-reduced-motion: reduce)').matches
  ? 'auto'
  : 'smooth';

const editorTargetTop = (target) => {
  const scrollRect = editorScroll.getBoundingClientRect();
  const parentSection = form.querySelector(`[data-editor-section="${CSS.escape(target)}"]`);
  if (parentSection) {
    return editorScroll.scrollTop
      + parentSection.getBoundingClientRect().top
      - scrollRect.top;
  }
  const templateSection = editorOutline.find((section) => section.id === target);
  if (!templateSection) return null;
  return editorScroll.scrollTop
    + templateFrame.getBoundingClientRect().top
    - scrollRect.top
    + templateSection.offsetTop;
};

const setActiveOutline = (target) => {
  outline.querySelectorAll('[data-editor-outline-target]').forEach((button) => {
    const active = button.dataset.editorOutlineTarget === target;
    button.classList.toggle('is-current', active);
    if (active) button.setAttribute('aria-current', 'location');
    else button.removeAttribute('aria-current');
  });
  if ([...outlineSelect.options].some((option) => option.value === target)) {
    outlineSelect.value = target;
  }
};

const scrollToEditorSection = (target) => {
  const top = editorTargetTop(target);
  if (top === null) return;
  editorScroll.scrollTo({
    top,
    behavior: editorScrollBehavior,
  });
  setActiveOutline(target);
};

outline.addEventListener('click', (event) => {
  const target = event.target.closest('[data-editor-outline-target]')?.dataset.editorOutlineTarget;
  if (target) scrollToEditorSection(target);
});
outlineSelect.addEventListener('change', () => scrollToEditorSection(outlineSelect.value));

let outlineFrame = null;
const updateOutlineFromScroll = () => {
  outlineFrame = null;
  const targets = [...outline.querySelectorAll('[data-editor-outline-target]')]
    .map((button) => ({
      id: button.dataset.editorOutlineTarget,
      top: editorTargetTop(button.dataset.editorOutlineTarget),
    }))
    .filter((entry) => entry.top !== null)
    .sort((left, right) => left.top - right.top);
  const current = targets.reduce(
    (active, entry) =>
      entry.top <= editorScroll.scrollTop + 80 ? entry : active,
    targets[0],
  );
  if (current) setActiveOutline(current.id);
};
const onEditorScroll = () => {
  if (outlineFrame !== null) return;
  outlineFrame = requestAnimationFrame(updateOutlineFromScroll);
};
editorScroll.addEventListener('scroll', onEditorScroll, { passive: true });
setActiveOutline('index');

form.querySelector('[data-reload-template]').addEventListener('click', () => {
  editorBridge?.dispose();
  editorBridge = null;
  mountEditorBridge({ waitForLoad: true });
  if (templateFrame.contentWindow) {
    templateFrame.contentWindow.location.reload();
  } else {
    templateFrame.setAttribute('src', activePreviewUrl);
  }
});
```

Remove the scroll and iframe-error listeners, cancel `outlineFrame`, and clear
`templateLoadTimeout` in `windowState.dispose`.

`mountEditorBridge({ waitForLoad: true })` installs the new load listener before
`location.reload()` starts the retry. The same-origin template URL remains
unchanged, so retry does not create a second draft identity.

Add the explicit fallback presentation:

```css
.archive-editor__canvas.has-layout-error [data-template-height-fallback] {
  display: flex;
}

.archive-editor__canvas.has-layout-error [data-template-editor-frame] {
  min-height: 520px;
  max-height: 70vh;
  border: 1px solid var(--editor-brick, #b5432e);
}
```

Run:

```powershell
node --test tests/workspace-ux-regression.test.mjs tests/local-admin-runtime-browser.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit unified iframe navigation**

```powershell
git add -- src/archive-workflow/workspace.js src/archive-workflow/workspace.css tests/workspace-ux-regression.test.mjs tests/local-admin-runtime-browser.test.mjs
git commit -m "feat: add unified editor section navigation"
```

---

### Task 5: Complete save, submission, dirty-exit, and submitted states

**Files:**

- Modify: `src/archive-workflow/workspace.js:760-850`
- Modify: `src/archive-workflow/workspace.js:1400-1670`
- Modify: `tests/clerk-workflow-ui.test.mjs`
- Modify: `tests/local-admin-runtime-browser.test.mjs`

**Interfaces:**

- Consumes shell events `palis:workspace-flush-request` and `palis:workspace-discard-request`.
- Produces shell event `palis:workspace-dirty-change` detail `{ key, dirty }`.
- Assigns `windowState.dirtyKey = localKey` so the generic workflow close button
  uses the shell confirmation contract.
- Editor form state is `editing`, `saving`, or `submitted`.

- [ ] **Step 1: Add failing state-contract tests**

Add:

```js
test('editor reports dirty state and locks after successful submission', () => {
  assert.match(workspace, /palis:workspace-dirty-change/);
  assert.match(workspace, /palis:workspace-flush-request/);
  assert.match(workspace, /palis:workspace-discard-request/);
  assert.match(workspace, /data-editor-submission-state/);
  assert.match(workspace, /data-document-errors/);
  assert.match(workspace, /data-editor-outline-error/);
  assert.match(workspace, /hasMeaningfulArchiveBody/);
  assert.match(workspace, /setReadOnly\(true\)/);
  assert.match(workspace, /已提交审核/);
});
```

Add a browser assertion after editing the title:

```js
await page.$eval('[data-index-key="title"]', (input) => {
  input.value = '统一编辑器事件';
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
assert.equal(
  await page.$eval('[data-archive-editor]', (form) =>
    form.dataset.editorSubmissionState),
  'editing',
);
await page.evaluate(() => {
  const values = {
    title: '统一编辑器事件',
    startDate: '1965-01-17',
    timePrecision: 'DAY',
    location: '白幕副入口',
    reviewStatus: '已复核',
  };
  Object.entries(values).forEach(([key, value]) => {
    const control = document.querySelector(`[data-index-key="${key}"]`);
    control.value = value;
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
  });
});
await page.click('[data-submit-draft]');
await page.waitForSelector('[data-document-errors]:not([hidden])');
assert.match(
  await page.$eval('[data-document-errors]', (node) => node.textContent),
  /至少需要填写一个正文词条/,
);
await page.click('.archive-editor-window [data-workflow-close]');
await page.waitForSelector('#workspace-exit-dialog[open]');
await page.click('[data-workspace-exit-action="cancel"]');
assert.notEqual(
  await page.$('.archive-editor-window:not([hidden])'),
  null,
);
```

- [ ] **Step 2: Run tests and verify event-contract failure**

Run:

```powershell
node --test tests/clerk-workflow-ui.test.mjs tests/local-admin-runtime-browser.test.mjs
```

Expected: FAIL on body validation/submission locking. The shell plan already
provides dirty-state, volatile-file, and exact autosave-generation contracts.

- [ ] **Step 3: Reuse the shell dirty adapter and complete manual save**

Hoist both footer controls with the other form queries and remove the
submit-handler-local `const submitButton`:

```js
const saveButton = form.querySelector('[data-save-now]');
const submitButton = form.querySelector('[data-submit-draft]');
const documentErrors = form.querySelector('[data-document-errors]');
const indexErrorCount = form.querySelector(
  '[data-editor-outline-error="index"]',
);
const documentErrorCount = form.querySelector(
  '[data-editor-outline-error="document"]',
);
```

The shell plan has already installed `windowState.dirtyKey`,
`queueDraftAutosave`, exact queued/synced generations, volatile media and
attachment detection, filtered flush/discard listeners, and disposal cleanup.
Do not redeclare those names or register a second listener. Add source
assertions that `hasVolatileFileSelection()` participates in
`reportDirtyState()` and that volatile files reject save-and-leave.

Replace the `立即暂存` handler with local-first then cloud behavior:

```js
saveButton.addEventListener('click', async () => {
  saveButton.disabled = true;
  queueDraftAutosave();
  try {
    if (!client) {
      await autosave.flushLocal();
      message.textContent = '已保存到本地；档案服务未连接，可稍后继续同步。';
      return;
    }
    const result = await autosave.flushRemote();
    if (['conflict', 'network-error', 'session-expired', 'permission-denied', 'cloud-error']
      .includes(result?.status)) {
      message.textContent = '已保存到本地；云端同步失败，可稍后重试。';
      return;
    }
    message.textContent = '当前内容已保存到本地并同步云端。';
  } finally {
    if (!submitted) saveButton.disabled = false;
  }
});
```

Retain the shell adapter's disposal cleanup. Manual save may synchronize text,
but `reportDirtyState()` must remain dirty while a pending `File` exists. The
local-administrator IndexedDB repository is a connected `client` and therefore
follows the synchronized branch; only a genuinely disconnected
`client === null` runtime remains text-dirty after a manual local save.

- [ ] **Step 4: Lock successful submissions and preserve failures**

Add one minimum-body check that ignores system-owned and index-synchronized
duplicates but accepts every other template or freeform amendment field:

```js
const NON_BODY_FIELD_KEYS = new Set([
  'dossierNo',
  'entryCode',
  'regDate',
  'clerk',
  'hero',
  ...Object.values(SYNCHRONIZED_TEMPLATE_KEYS),
]);

const hasMeaningfulArchiveBody = (document) => Object.entries(
  document?.values ?? {},
).some(([key, value]) =>
  !NON_BODY_FIELD_KEYS.has(key) && String(value ?? '').trim().length > 0);

const showDocumentError = (invalid) => {
  documentErrors.hidden = !invalid;
  documentErrors.textContent = invalid
    ? '档案正文至少需要填写一个正文词条。'
    : '';
  documentErrorCount.hidden = !invalid;
  documentErrorCount.value = invalid ? '1' : '';
};
```

At the end of `showIndexErrors(missing)`, update the index outline count:

```js
indexErrorCount.hidden = missing.length === 0;
indexErrorCount.value = missing.length ? String(missing.length) : '';
```

At submit start, collect once, validate the index, then validate the body:

```js
const collectedDraft = collectDraft();
const validation = validateArchiveIndexData(
  template.category,
  collectedDraft.content.indexData,
);
if (!validation.valid) {
  fillIndexControls(validation.value);
  showIndexErrors(validation.missing);
  focusIndexField(validation.missing[0]);
  message.textContent = '请先补全“目录归类与索引登记”的必填内容。';
  return;
}
showIndexErrors([]);
if (!hasMeaningfulArchiveBody(editorDocument)) {
  showDocumentError(true);
  scrollToEditorSection('document');
  templateFrame.focus({ preventScroll: true });
  message.textContent = '请至少填写一个档案正文词条。';
  return;
}
showDocumentError(false);
```

Add one state helper:

```js
const setSubmissionState = (state) => {
  form.dataset.editorSubmissionState = state;
  const locked = state !== 'editing';
  submitButton.disabled = locked;
  saveButton.disabled = locked;
};
```

Call `setSubmissionState('saving')` only after index/body/native validity,
connected-client, target archive/document, and attachment-size checks have all
passed, immediately before the first remote/local-repository operation. This
leaves every synchronous early return in `editing`.

On `showStoppedSubmission()` and in `catch`, call:

```js
setSubmissionState('editing');
```

On success:

```js
submitted = true;
editorDirty = false;
setSubmissionState('submitted');
editorBridge?.setReadOnly(true);
clearPendingMedia();
form.elements.attachments.value = '';
form.querySelectorAll('input, select, textarea, button').forEach((control) => {
  control.disabled = true;
});
const submissionId = submissionResult.submission?.id || editorDraft.id || 'PENDING';
message.textContent = `已提交审核 / ${submissionId}。批复会出现在“审核回信”。`;
autosave.clear(localKey);
reportDirtyState();
```

Ensure failure never calls `autosave.clear(localKey)`.

Run:

```powershell
node --test tests/clerk-workflow-ui.test.mjs tests/local-admin-runtime-browser.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit editor lifecycle states**

```powershell
git add -- src/archive-workflow/workspace.js tests/clerk-workflow-ui.test.mjs tests/local-admin-runtime-browser.test.mjs
git commit -m "feat: complete unified editor lifecycle states"
```

---

### Task 6: Apply one PALIS visual system and verify all nine editors

**Files:**

- Modify: `src/archive-workflow/workspace.css`
- Modify: `tests/workspace-ux-regression.test.mjs`
- Create: `tests/unified-archive-editor-browser.test.mjs`
- Modify: `tests/local-admin-runtime-browser.test.mjs`
- Modify: `scripts/verify-local-admin.mjs`

**Interfaces:**

- Consumes: ordered sections, embed height, outline, and state attributes from Tasks 1–5.
- Produces: one PALIS client-area visual system at 1440×900, 2048×1152, and 390×844.

- [ ] **Step 1: Add failing visual-contract and nine-category browser tests**

Add CSS assertions:

```js
test('unified editor auxiliary sections use one PALIS client-area language', () => {
  assert.match(workflowStyles, /\.archive-editor\s*\{[^}]*--editor-bg:/s);
  assert.match(workflowStyles, /\.archive-editor__content\s*\{[^}]*background:\s*#3a3226/s);
  assert.match(workflowStyles, /\.archive-index-editor[\s\S]*background:\s*var\(--editor-panel\)/s);
  assert.match(workflowStyles, /\.archive-reference-editor[\s\S]*background:\s*var\(--editor-panel\)/s);
  assert.match(workflowStyles, /\.archive-media-editor[\s\S]*background:\s*var\(--editor-panel\)/s);
  assert.match(workflowStyles, /\.archive-editable-picker[\s\S]*background:\s*var\(--editor-panel\)/s);
  assert.match(workflowStyles, /\.archive-reference-results\s*\{[^}]*max-height:\s*none/s);
  assert.match(workflowStyles, /\.archive-editor__outline\s*\{[^}]*flex-wrap:\s*wrap/s);
  assert.match(workflowStyles, /button\[aria-current='location'\]/);
  assert.match(workflowStyles, /\.archive-editor__footer\s*\{[^}]*position:\s*sticky/s);
});
```

Create `tests/unified-archive-editor-browser.test.mjs` with the complete local
administrator fixture and helpers:

```js
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import puppeteer from 'puppeteer-core';

import { resolveBrowserExecutable } from '../scripts/palis-browser-runtime.mjs';
import { ARCHIVE_TEMPLATE_BY_CODE } from '../src/archive-workflow/templates.js';
import { startPalisTestServer } from './helpers/palis-test-server.mjs';

const editorCaptureDirectory = resolve(
  process.cwd(),
  'tmp',
  'ui-check',
  'unified-editor',
);
const mediaFixturePath = resolve(
  process.cwd(),
  'public',
  'assets',
  'mascot',
  'idle-02.png',
);

const openWorkspaceAndCabinet = async (page, url) => {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.accessMode === 'local-admin',
    { timeout: 20_000 },
  );
  await page.click('#clerk-workspace-entry');
  await page.waitForSelector('body.clerk-desktop-open #clerk-desktop.is-open:not([hidden])');
  const welcomeClose = await page.$(
    '#clerk-desktop-welcome:not([hidden]) #clerk-desktop-welcome-close',
  );
  if (welcomeClose) await welcomeClose.click();
  await page.click(
    '[data-workspace-shortcut][data-workspace-command="cabinet"]',
    { count: 2, delay: 40 },
  );
  await page.waitForSelector('.archive-cabinet-window:not([hidden])');
};

const openCabinetTemplate = async (page, code) => {
  await page.click(
    `.archive-cabinet-window:not([hidden]) [data-archive-template="${code}"]`,
    { count: 2, delay: 40 },
  );
  await page.waitForSelector(
    `#archive-workflow-editor-${code}:not([hidden]) [data-template-editor-frame]`,
  );
  await page.waitForFunction((windowId) => {
    const frame = document.querySelector(
      `#${windowId} [data-template-editor-frame]`,
    );
    return frame?.contentDocument?.documentElement?.dataset
      ?.palisWorkspaceEmbed === 'true';
  }, {}, `archive-workflow-editor-${code}`);
};

const closeActiveEditor = async (page, code) => {
  await page.click(
    `#archive-workflow-editor-${code} [data-workflow-close]`,
  );
  const confirmation = await page.$('#workspace-exit-dialog[open]');
  if (confirmation) {
    await page.click('[data-workspace-exit-action="discard"]');
  }
  await page.waitForFunction(
    (windowId) => !document.querySelector(`#${windowId}`),
    {},
    `archive-workflow-editor-${code}`,
  );
  return Boolean(confirmation);
};
```

Then add one browser test with an explicit local-only lifecycle. For each
viewport and template code:

```js
test('local administrator can open every unified editor at all supported widths',
  { timeout: 240_000 }, async () => {
    process.env.VITE_PALIS_LOCAL_ADMIN = '1';
    const server = await startPalisTestServer();
    const browser = await puppeteer.launch({
      executablePath: resolveBrowserExecutable(),
      headless: true,
    });
    const page = await browser.newPage();
    await page.emulateMediaFeatures([
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ]);
    const requests = [];
    let embeddedEventGeometry = null;
    page.on('request', (request) => requests.push(request.url()));
    try {
      await openWorkspaceAndCabinet(page, server.url);
      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 2048, height: 1152 },
        { width: 390, height: 844 },
      ]) {
        await page.setViewport(viewport);
        for (const code of ['01', '02', '03', '04', '05', '06', '07', '08', '09']) {
          await openCabinetTemplate(page, code);
          if (code === '07') {
            for (const kind of ['contribution', 'amendment']) {
              await page.select(
                '#archive-workflow-editor-07 select[name="kind"]',
                kind,
              );
              await page.waitForSelector(
                '#archive-workflow-editor-07 '
                + '[data-editable-archive-picker]:not([hidden])',
              );
              const pickerStyle = await page.$eval(
                '#archive-workflow-editor-07 [data-editable-archive-picker]',
                (node) => ({
                  background: getComputedStyle(node).backgroundColor,
                  color: getComputedStyle(node).color,
                }),
              );
              assert.notEqual(pickerStyle.background, 'rgb(192, 192, 192)');
              assert.notEqual(pickerStyle.color, 'rgb(0, 0, 0)');
            }
            await page.select(
              '#archive-workflow-editor-07 select[name="kind"]',
              'new',
            );
            await page.waitForFunction(() =>
              decodeURIComponent(document.querySelector(
                '#archive-workflow-editor-07 [data-template-editor-frame]',
              )?.contentWindow?.location?.pathname ?? '').includes(
                '/templates/07-',
              )
              && document.querySelector(
                '#archive-workflow-editor-07 [data-template-editor-frame]',
              )?.contentDocument?.documentElement?.dataset
                ?.palisWorkspaceEmbed === 'true');
          }
          await page.evaluate((windowId, templateCode) => {
            const editor = document.querySelector(
              `#${windowId} [data-archive-editor]`,
            );
            const title = editor.querySelector('[data-index-key="title"]');
            title.value = `本地验收 ${templateCode}`;
            title.dispatchEvent(new Event('input', { bubbles: true }));
            const frame = editor.querySelector('[data-template-editor-frame]');
            const bodyField = [...frame.contentDocument.querySelectorAll('[data-save]')]
              .find((node) =>
                node.dataset.indexSynchronized !== 'true'
                && !node.dataset.systemField
                && node.getAttribute('contenteditable') !== 'false'
                && node.getAttribute('aria-readonly') !== 'true');
            if (!bodyField) {
              throw new Error(`Template ${templateCode} has no editable body field`);
            }
            if ('value' in bodyField) {
              bodyField.value = `正文验收 ${templateCode}`;
            } else {
              bodyField.textContent = `正文验收 ${templateCode}`;
            }
            bodyField.dispatchEvent(new Event('input', { bubbles: true }));
          }, `archive-workflow-editor-${code}`, code);
          if (['06', '07'].includes(code)) {
            const mediaInput = await page.$(
              `#archive-workflow-editor-${code} [data-archive-media-input]`,
            );
            await mediaInput.uploadFile(mediaFixturePath);
            await page.waitForSelector(
              `#archive-workflow-editor-${code} [data-archive-media-entry]`,
            );
          }
          await page.click(
            `#archive-workflow-editor-${code} [data-save-now]`,
          );
          await page.waitForFunction((windowId, templateCode) => {
            const form = document.querySelector(`#${windowId} [data-archive-editor]`);
            const message = form?.querySelector('[data-editor-message]')
              ?.textContent ?? '';
            const stored = localStorage.getItem(
              `palis:draft:local-admin:${templateCode}:new`,
            );
            if (!form || form.querySelector('[data-save-now]').disabled || !stored) {
              return false;
            }
            const draft = JSON.parse(stored);
            return /已保存到本地|已同步云端/.test(message)
              && draft.content?.indexData?.title === `本地验收 ${templateCode}`
              && Object.values(draft.content?.values ?? {})
                .includes(`正文验收 ${templateCode}`);
          }, {}, `archive-workflow-editor-${code}`, code);
          await page.$eval(
            `#archive-workflow-editor-${code} [data-reference-results]`,
            (results) => {
              results.hidden = false;
              results.innerHTML = Array.from(
                { length: 20 },
                (_, index) =>
                  `<button type="button">引用压力项 ${index + 1}</button>`,
              ).join('');
            },
          );
          const state = await page.evaluate((windowId) => {
            const editor = document.querySelector(
              `#${windowId} [data-archive-editor]`,
            );
            const frame = editor.querySelector('[data-template-editor-frame]');
            const editorScroll = editor.querySelector('[data-editor-scroll]');
            const outline = editor.querySelector('[data-editor-outline]');
            const frameRoot = frame.contentDocument.documentElement;
            const frameBody = frame.contentDocument.body;
            const frameDocumentSurface = frame.contentDocument.querySelector(
              '#doc',
            );
            const lastOutlineButton = [
              ...outline.querySelectorAll(':scope > button'),
            ].at(-1);
            const outlineRect = outline.getBoundingClientRect();
            const lastOutlineRect = lastOutlineButton.getBoundingClientRect();
            const scrollableNodes = [...editor.querySelectorAll('*')]
              .filter((node) => {
                const style = getComputedStyle(node);
                return /auto|scroll/.test(style.overflowY)
                  && node.scrollHeight > node.clientHeight;
              });
            return {
              scrollContainerCount: scrollableNodes.length,
              editorScrollIsOnlyOwner: scrollableNodes.length === 1
                && scrollableNodes[0].matches('[data-editor-scroll]'),
              horizontalContained:
                editor.scrollWidth <= editor.clientWidth + 1
                && editorScroll.scrollWidth <= editorScroll.clientWidth + 1
                && frame.getBoundingClientRect().right
                  <= editorScroll.getBoundingClientRect().right + 1,
              iframeContentContained: Math.max(
                frameRoot.scrollWidth,
                frameBody.scrollWidth,
                frameDocumentSurface?.scrollWidth ?? 0,
              ) <= frame.contentWindow.innerWidth + 1,
              outlineFits: outline.scrollWidth <= outline.clientWidth + 1,
              lastOutlineButtonVisible:
                lastOutlineRect.right <= outlineRect.right + 1
                && lastOutlineRect.bottom <= outlineRect.bottom + 1,
              frameOverflow: getComputedStyle(
                frame.contentDocument.documentElement,
              ).overflow,
              embeddedActionbar: getComputedStyle(
                frame.contentDocument.querySelector('.actionbar'),
              ).display,
              mediaVisible: Boolean(
                editor.querySelector('[data-archive-media-editor]'),
              ),
              synchronizedFields: [...frame.contentDocument.querySelectorAll(
                '[data-index-synchronized="true"]',
              )].map((node) => ({
                key: node.dataset.save,
                editable: node.getAttribute('contenteditable'),
                readonly: node.getAttribute('aria-readonly'),
              })),
              kind: editor.elements.kind.value,
              kindOptions: [...editor.elements.kind.options]
                .map((option) => option.value),
            };
          }, `archive-workflow-editor-${code}`);
          assert.equal(state.scrollContainerCount, 1);
          assert.equal(state.editorScrollIsOnlyOwner, true);
          assert.equal(state.horizontalContained, true);
          assert.equal(state.iframeContentContained, true);
          assert.equal(state.outlineFits, true);
          assert.equal(state.lastOutlineButtonVisible, true);
          assert.equal(state.frameOverflow, 'hidden');
          assert.equal(state.embeddedActionbar, 'none');
          assert.equal(state.mediaVisible, ['06', '07'].includes(code));
          assert.equal(state.kind, 'new');
          assert.deepEqual(
            state.kindOptions,
            ['new', 'contribution', 'amendment'],
          );
          const synchronizedKeys = ['hero'];
          if (['03', '04'].includes(code)) synchronizedKeys.push('f_5Z2Q5qCH');
          if (code === '07') synchronizedKeys.push('f_5YR55Sf5pe25pyf');
          if (code === '09') {
            synchronizedKeys.push(
              'f_5qSN54mp77yP5Yqo54mp77yP5aSN5ZCI576k6JC9',
            );
          }
          assert.deepEqual(
            state.synchronizedFields.map(({ key }) => key),
            synchronizedKeys,
          );
          assert.equal(
            state.synchronizedFields.every(({ editable, readonly }) =>
              editable === 'false' && readonly === 'true'),
            true,
          );
          if (code === '07') {
            if (viewport.width === 1440) {
              embeddedEventGeometry = await page.$eval(
                '#archive-workflow-editor-07 [data-template-editor-frame]',
                (frame) => {
                  const pageElement = frame.contentDocument.querySelector('.page');
                  const section = frame.contentDocument.querySelector('.sect');
                  const pageRect = pageElement.getBoundingClientRect();
                  const sectionRect = section.getBoundingClientRect();
                  return {
                    viewportWidth: frame.contentWindow.innerWidth,
                    pageWidth: Math.round(pageRect.width),
                    pageHeight: Math.round(pageRect.height),
                    sectionWidth: Math.round(sectionRect.width),
                    sectionHeight: Math.round(sectionRect.height),
                  };
                },
              );
            }
            await page.waitForSelector(
              '#archive-workflow-editor-07 [data-template-outline-item]',
            );
            const templateTarget = await page.$eval(
              '#archive-workflow-editor-07 [data-template-outline-item]',
              (node) => node.dataset.editorOutlineTarget,
            );
            if (viewport.width <= 760) {
              await page.select(
                '#archive-workflow-editor-07 [data-editor-outline-select]',
                templateTarget,
              );
            } else {
              await page.click(
                '#archive-workflow-editor-07 '
                + `[data-editor-outline-target="${templateTarget}"]`,
              );
            }
            await page.waitForFunction((target) =>
              document.querySelector(
                '#archive-workflow-editor-07 '
                + `[data-editor-outline-target="${CSS.escape(target)}"]`,
              )?.getAttribute('aria-current') === 'location',
            {}, templateTarget);
            const templateGeometry = await page.$eval(
              '#archive-workflow-editor-07 [data-template-editor-frame]',
              (frame, target) => {
                const section = frame.contentDocument.querySelector(
                  `#${CSS.escape(target)}`,
                );
                const scroll = frame.closest('[data-editor-scroll]');
                return {
                  sectionTop: frame.getBoundingClientRect().top
                    + section.getBoundingClientRect().top,
                  scrollTop: scroll.getBoundingClientRect().top,
                };
              },
              templateTarget,
            );
            assert.ok(
              Math.abs(templateGeometry.sectionTop - templateGeometry.scrollTop)
                < 140,
            );
            if (viewport.width <= 760) {
              await page.select(
                '#archive-workflow-editor-07 [data-editor-outline-select]',
                'attachments',
              );
            } else {
              await page.click(
                '#archive-workflow-editor-07 '
                + '[data-editor-outline-target="attachments"]',
              );
            }
            await page.waitForFunction(() =>
              document.querySelector(
                '#archive-workflow-editor-07 '
                + '[data-editor-outline-target="attachments"]',
              )?.getAttribute('aria-current') === 'location');
            assert.ok(
              await page.$eval(
                '#archive-workflow-editor-07 [data-editor-scroll]',
                (node) => node.scrollTop,
              ) > 0,
            );
          }
          if (process.env.PALIS_CAPTURE_UI === '1' && code === '07') {
            if (viewport.width <= 760) {
              await page.select(
                '#archive-workflow-editor-07 [data-editor-outline-select]',
                'index',
              );
            } else {
              await page.click(
                '#archive-workflow-editor-07 '
                + '[data-editor-outline-target="index"]',
              );
            }
            await page.waitForFunction(() =>
              document.querySelector(
                '#archive-workflow-editor-07 [data-editor-scroll]',
              )?.scrollTop < 16);
            await mkdir(editorCaptureDirectory, { recursive: true });
            await page.screenshot({
              path: resolve(
                editorCaptureDirectory,
                `event-${viewport.width}x${viewport.height}.png`,
              ),
            });
          }
          const volatilePrompt = await closeActiveEditor(page, code);
          assert.equal(
            volatilePrompt,
            ['06', '07'].includes(code),
            `template ${code} volatile-file exit guard`,
          );
        }
      }
      assert.equal(
        requests.some((url) =>
          url.includes('/src/archive-workflow/client.js')
          || url.includes('@supabase')),
        false,
      );

      // Close the loop with one real local-repository submission, not only
      // source assertions or a manual-save path.
      await page.setViewport({ width: 1440, height: 900 });
      await openCabinetTemplate(page, '01');
      await page.evaluate(() => {
        const form = document.querySelector(
          '#archive-workflow-editor-01 [data-archive-editor]',
        );
        form.querySelectorAll('[data-index-key]').forEach((control) => {
          if (control instanceof HTMLSelectElement) {
            control.value = [...control.options]
              .find((option) => option.value)?.value ?? '';
          } else if (control.type === 'date') {
            control.value = '1965-01-17';
          } else if (control.type === 'number') {
            control.value = '1';
          } else {
            control.value = '本地提交验收';
          }
          control.dispatchEvent(new Event('input', { bubbles: true }));
          control.dispatchEvent(new Event('change', { bubbles: true }));
        });
        const frame = form.querySelector('[data-template-editor-frame]');
        const bodyField = [...frame.contentDocument.querySelectorAll('[data-save]')]
          .find((node) =>
            node.dataset.indexSynchronized !== 'true'
            && !node.dataset.systemField
            && node.getAttribute('contenteditable') !== 'false'
            && node.getAttribute('aria-readonly') !== 'true');
        if (!bodyField) throw new Error('Country template has no editable body');
        if ('value' in bodyField) bodyField.value = '正式提交正文';
        else bodyField.textContent = '正式提交正文';
        bodyField.dispatchEvent(new Event('input', { bubbles: true }));
      });
      const submissionAttachment = await page.$(
        '#archive-workflow-editor-01 input[name="attachments"]',
      );
      await submissionAttachment.uploadFile(mediaFixturePath);
      await page.click(
        '#archive-workflow-editor-01 [data-submit-draft]',
      );
      await page.waitForFunction(() =>
        document.querySelector(
          '#archive-workflow-editor-01 [data-archive-editor]',
        )?.dataset.editorSubmissionState === 'submitted',
      { timeout: 20_000 });
      const submittedState = await page.evaluate(() => {
        const form = document.querySelector(
          '#archive-workflow-editor-01 [data-archive-editor]',
        );
        const frame = form.querySelector('[data-template-editor-frame]');
        return {
          message: form.querySelector('[data-editor-message]').textContent,
          controlsDisabled: [...form.querySelectorAll(
            'input, select, textarea, button',
          )].every((control) => control.disabled),
          documentReadOnly: [...frame.contentDocument.querySelectorAll(
            '[data-save]',
          )].every((node) =>
            node.getAttribute('contenteditable') === 'false'
            && node.getAttribute('aria-readonly') === 'true'),
          attachmentInputCleared: form.elements.attachments.files.length === 0,
          draftCleared:
            localStorage.getItem('palis:draft:local-admin:01:new') === null,
        };
      });
      const attachmentPersisted = await page.evaluate(() =>
        new Promise((resolve, reject) => {
          const openRequest = indexedDB.open('palis-local-verification-v1');
          openRequest.onerror = () => reject(openRequest.error);
          openRequest.onsuccess = () => {
            const database = openRequest.result;
            const transaction = database.transaction('state', 'readonly');
            const getRequest = transaction.objectStore('state').get('current');
            getRequest.onerror = () => reject(getRequest.error);
            getRequest.onsuccess = () => resolve(
              (getRequest.result?.attachments ?? []).some((attachment) =>
                attachment.file_name === 'idle-02.png'
                && attachment.role === null
                && Boolean(attachment.contribution_id)),
            );
            transaction.oncomplete = () => database.close();
          };
        }));
      assert.match(submittedState.message, /已提交审核 \//);
      assert.equal(submittedState.controlsDisabled, true);
      assert.equal(submittedState.documentReadOnly, true);
      assert.equal(submittedState.attachmentInputCleared, true);
      assert.equal(submittedState.draftCleared, true);
      assert.equal(attachmentPersisted, true);
      assert.equal(await closeActiveEditor(page, '01'), false);

      const standalone = ARCHIVE_TEMPLATE_BY_CODE['07'];
      await page.setViewport({
        width: embeddedEventGeometry.viewportWidth,
        height: 900,
      });
      await page.goto(
        `${server.url}/templates/${encodeURIComponent(standalone.sourceFile)}`,
        { waitUntil: 'domcontentloaded' },
      );
      assert.notEqual(
        await page.$eval('.actionbar', (node) => getComputedStyle(node).display),
        'none',
      );
      const standaloneGeometry = await page.evaluate(() => {
        const pageElement = document.querySelector('.page');
        const section = document.querySelector('.sect');
        const pageRect = pageElement.getBoundingClientRect();
        const sectionRect = section.getBoundingClientRect();
        return {
          viewportWidth: innerWidth,
          pageWidth: Math.round(pageRect.width),
          pageHeight: Math.round(pageRect.height),
          sectionWidth: Math.round(sectionRect.width),
          sectionHeight: Math.round(sectionRect.height),
        };
      });
      assert.deepEqual(embeddedEventGeometry, standaloneGeometry);
    } finally {
      delete process.env.VITE_PALIS_LOCAL_ADMIN;
      await page.close();
      await browser.close();
      await server.close();
    }
  }
);
```

The existing `tests/archive-cabinet.test.mjs` and
`tests/clerk-workflow-ui.test.mjs` retain the clerk-only `03`/`04` amendment
assertions; this browser fixture intentionally exercises the requested local
administrator path without cloud authentication.

Update the narrow-editor evidence in `scripts/verify-local-admin.mjs` to remove
the deleted split/rail selectors:

```js
const narrowEditorEvidence = await page.evaluate(() => {
  const dialog = document.querySelector('.archive-editor-window:not([hidden])');
  const scroll = dialog?.querySelector('[data-editor-scroll]');
  const outline = dialog?.querySelector('[data-editor-outline-select]');
  const rect = dialog?.getBoundingClientRect();
  const scrollingNodes = [...(dialog?.querySelectorAll('*') ?? [])]
    .filter((node) => {
      const style = getComputedStyle(node);
      return /auto|scroll/.test(style.overflowY)
        && node.scrollHeight > node.clientHeight;
    });
  return {
    viewportWidth: innerWidth,
    dialogContained: Boolean(
      rect
      && rect.left >= 0
      && rect.right <= innerWidth
      && rect.top >= 0
      && rect.bottom <= innerHeight,
    ),
    outlineVisible: Boolean(outline && getComputedStyle(outline).display !== 'none'),
    oneScrollOwner: scrollingNodes.length === 1 && scrollingNodes[0] === scroll,
    focusInside: Boolean(dialog?.contains(document.activeElement)),
  };
});
```

Change the matching expected evidence to
`{ viewportWidth: 390, dialogContained: true, outlineVisible: true, oneScrollOwner: true, focusInside: true }`.

- [ ] **Step 2: Run tests and verify visual/nine-category failure**

Run:

```powershell
node --test tests/workspace-ux-regression.test.mjs tests/unified-archive-editor-browser.test.mjs
```

Expected: FAIL until PALIS auxiliary styling and all browser helpers are complete.

- [ ] **Step 3: Replace auxiliary-section styling with shared tokens**

Before editing CSS, read the `ui-ux-pro-max` skill and retain its approved
PALIS × Win95 split: Win95 chrome outside, PALIS document language inside.

Use one client-area token set at the form root so the outline, toolbar, content,
mode picker, and footer share it:

```css
.archive-editor {
  --editor-bg: #3a3226;
  --editor-panel: #182c42;
  --editor-panel-strong: #20394f;
  --editor-cream: #efe6d2;
  --editor-muted: #b8c2cc;
  --editor-mustard: #d9a73b;
  --editor-brick: #b5432e;
  --editor-teal: #3e7c82;
}

.archive-editor__content {
  padding: 18px;
  color: var(--editor-cream);
  background: var(--editor-bg);
}

.archive-editor__section {
  width: min(1120px, 100%);
  margin-inline: auto;
  padding: 16px;
  border: 1px solid rgba(239, 230, 210, .24);
  background: #0e1e30;
}

.archive-index-editor,
.archive-reference-editor,
.archive-media-editor,
.archive-editable-picker,
.archive-editor__attribution {
  color: var(--editor-cream);
  border-color: rgba(239, 230, 210, .24);
  background: var(--editor-panel);
}

.archive-editable-picker {
  margin-top: 14px;
  padding: 12px;
  border: 1px solid rgba(239, 230, 210, .24);
}

.archive-editable-picker > header,
.archive-target-document-picker {
  padding-block: 8px;
  border-bottom: 1px solid rgba(239, 230, 210, .2);
}

.archive-editable-picker p {
  color: var(--editor-muted);
}

.archive-editable-picker button {
  min-height: 36px;
  border: 1px solid var(--editor-cream);
  border-radius: 0;
  color: var(--editor-cream);
  background: var(--editor-teal);
}

.archive-reference-results {
  max-height: none;
  overflow: visible;
}

.archive-editor__outline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding: 6px;
  border-block: 1px solid rgba(239, 230, 210, .24);
  background: #0e1e30;
}

.archive-editor__outline [data-editor-template-outline] {
  display: contents;
}

.archive-editor__outline button {
  flex: 0 1 auto;
  min-width: 0;
  max-width: min(220px, 100%);
  min-height: 34px;
  overflow: hidden;
  border: 1px solid transparent;
  border-radius: 0;
  color: var(--editor-cream);
  background: transparent;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.archive-editor__outline button[aria-current='location'] {
  border-color: var(--editor-mustard);
  color: #111;
  background: var(--editor-mustard);
}

.archive-editor__outline output:not([hidden]) {
  min-width: 1.35em;
  color: #fff;
  background: var(--editor-brick);
}

.archive-index-editor__fields > label > span,
.archive-editor-field > span,
.archive-editable-picker label > span {
  color: var(--editor-mustard);
  font: 600 11px/1.35 "IBM Plex Mono", monospace;
  letter-spacing: .04em;
}

.archive-index-editor input,
.archive-index-editor select,
.archive-editable-picker select,
.archive-reference-editor input,
.archive-media-editor input,
.archive-media-editor textarea,
.archive-editor-field input {
  min-height: 38px;
  border: 1px solid rgba(239, 230, 210, .55);
  border-radius: 0;
  color: var(--editor-cream);
  background: var(--editor-panel-strong);
}

.archive-editor :is(input, select, textarea, button, a):focus-visible,
.archive-editor [contenteditable]:focus-visible {
  outline: 2px dotted var(--editor-mustard);
  outline-offset: 2px;
}

.archive-index-editor [aria-invalid='true'],
.archive-editor__document-errors:not([hidden]) {
  border-color: var(--editor-brick);
}

.archive-editor__footer {
  position: sticky;
  z-index: 4;
  bottom: 0;
  padding-bottom: calc(8px + env(safe-area-inset-bottom));
}

.archive-editor__outline [data-editor-outline-select] {
  display: none;
  border: 1px solid var(--editor-mustard);
  border-radius: 0;
  color: var(--editor-cream);
  background: var(--editor-panel-strong);
}

@media (max-width: 760px) {
  .archive-editor__outline > button,
  .archive-editor__outline > [data-editor-template-outline] {
    display: none;
  }

  .archive-editor__outline [data-editor-outline-select] {
    display: block;
    width: 100%;
    min-height: 44px;
  }

  .archive-editor :is(input, select, textarea, button) {
    min-height: 44px;
  }
}
```

Do not add transitions or decorative animation.

- [ ] **Step 4: Run targeted tests, the full suite, build, local verification, and captures**

Run:

```powershell
node --test tests/archive-editor-embed-layout.test.mjs tests/archive-editor-bridge.test.mjs tests/clerk-workflow-ui.test.mjs tests/workspace-ux-regression.test.mjs tests/local-admin-runtime-browser.test.mjs tests/unified-archive-editor-browser.test.mjs
npm test
npm run build
npm run verify:baseline -- --public-only
npm run verify:local-admin
$env:PALIS_CAPTURE_UI='1'
node --test tests/unified-archive-editor-browser.test.mjs
Remove-Item Env:PALIS_CAPTURE_UI
```

Expected: every command exits with code 0, including all 33 public-only PALIS
baseline comparisons. Confirm the browser test did not
request Supabase modules in local-admin mode, standalone templates still
display `.actionbar`, and `tmp/ui-check/unified-editor/` contains the event
editor at all three viewports.

- [ ] **Step 5: Run UI Checker and correct material findings**

Read the `ui-checker` skill completely, inspect the three editor captures, and
exercise keyboard outline navigation, inline validation, image insertion, and
the sticky footer. Fix every high/medium finding that violates this plan,
rerun Step 4, and record any accepted low-severity exception in the
implementation handoff.

- [ ] **Step 6: Commit the verified nine-editor UI**

```powershell
git add -- src/archive-workflow/workspace.css scripts/verify-local-admin.mjs tests/workspace-ux-regression.test.mjs tests/unified-archive-editor-browser.test.mjs tests/local-admin-runtime-browser.test.mjs
git commit -m "style: complete unified PALIS archive editors"
```
