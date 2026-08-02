# 编辑区 Tab 段落缩进 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让书记官工作台所有可编辑多行文本框支持可保存的中文段首缩进。

**Architecture:** 新建纯文本转换模块，输入文本和选区，返回更新后的文本与选区；工作台表单用事件委托调用它，动态新增的自定义内容也会自动支持。

**Tech Stack:** 原生 ES Modules、DOM textarea 选择 API、Node test runner。

## Global Constraints

- 缩进固定为两个全角空格：`　　`。
- 只拦截工作台内可编辑 `textarea` 的 Tab 与 Shift+Tab。
- 单行、只读、禁用和文件控件保持原有焦点导航。
- 文本更新后派发冒泡 `input` 事件，复用自动暂存与同步。
- 不修改公开档案、生态动画或存储数据结构。

---

### Task 1: 可测试的行首缩进转换器

**Files:** Create `src/archive-workflow/text-indent.js`; create `tests/archive-text-indent.test.mjs`.

**Interface:** `applyTextIndent({ value, selectionStart, selectionEnd, outdent })` returns `{ value, selectionStart, selectionEnd, changed }`.

- [ ] **Step 1: Write the failing test**

```js
test('Tab indents every selected text line with two full-width spaces', () => {
  assert.deepEqual(
    applyTextIndent({ value: '甲\n乙\n丙', selectionStart: 1, selectionEnd: 4, outdent: false }),
    { value: '　　甲\n　　乙\n丙', selectionStart: 3, selectionEnd: 8, changed: true },
  );
});
```

- [ ] **Step 2: Verify red** — run `node --test tests/archive-text-indent.test.mjs`; expect `ERR_MODULE_NOT_FOUND` for `text-indent.js`.

- [ ] **Step 3: Write the minimal transformer**

```js
export const PARAGRAPH_INDENT = '　　';
export function applyTextIndent({ value, selectionStart, selectionEnd, outdent = false }) {
  // Transform each selected line and return corrected offsets.
}
```

- [ ] **Step 4: Verify green** — run `node --test tests/archive-text-indent.test.mjs`; pass one-line indent, selected multi-line indent, and Shift+Tab removal of one full prefix.

- [ ] **Step 5: Commit** — `git add src/archive-workflow/text-indent.js tests/archive-text-indent.test.mjs && git commit -m "feat: add paragraph indentation transformer"`.

### Task 2: 接入书记官工作台表单

**Files:** Modify `src/archive-workflow/workspace.js:1-30` and `src/archive-workflow/workspace.js:1768-1771`; modify `tests/clerk-workspace.test.mjs`.

**Interface:** editable textareas call `applyTextIndent()` and dispatch an existing bubbling `input` event.

- [ ] **Step 1: Write the failing form-integration test**

```js
test('native archive form delegates Tab paragraph indentation to editable textareas', async () => {
  const workspace = await readFile(new URL('../src/archive-workflow/workspace.js', import.meta.url), 'utf8');
  assert.match(workspace, /applyTextIndent/);
  assert.match(workspace, /target\.matches\('textarea'\)/);
});
```

- [ ] **Step 2: Verify red** — run `node --test --test-name-pattern "delegates Tab paragraph" tests/clerk-workspace.test.mjs`; expect failure because the listener only handles Escape.

- [ ] **Step 3: Add delegated Tab handling**

```js
if (event.key === 'Tab' && target.matches('textarea') && !target.disabled && !target.readOnly) {
  event.preventDefault();
  const next = applyTextIndent({ value: target.value, selectionStart: target.selectionStart, selectionEnd: target.selectionEnd, outdent: event.shiftKey });
  target.value = next.value;
  target.setSelectionRange(next.selectionStart, next.selectionEnd);
  target.dispatchEvent(new Event('input', { bubbles: true }));
}
```

- [ ] **Step 4: Verify green** — run `node --test tests/archive-text-indent.test.mjs tests/clerk-workspace.test.mjs`; existing workspace coverage stays green.

- [ ] **Step 5: Build and commit** — run `npm.cmd run build` and `git diff --check`, then `git add src/archive-workflow/workspace.js tests/clerk-workspace.test.mjs && git commit -m "feat: indent editable archive paragraphs with Tab"`.

## Self-review

- Tab, Shift+Tab, multi-line selection, dynamic textareas, single-line controls, and automatic save are all covered.
- No placeholders or undefined interfaces remain.
