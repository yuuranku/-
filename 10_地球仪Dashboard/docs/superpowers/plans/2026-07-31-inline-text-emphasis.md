# 档案正文加粗与遮蔽 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为所有档案编辑正文提供可保存的加粗与 SCP 式遮蔽，并在正式档案中安全显示。

**Architecture:** 在编辑文档中新增可选 `inlineMarks`，按字段保存字符偏移和 `bold`/`redacted` 两种效果。新增纯函数模块负责标记规范化、DOM 文本提取和安全渲染；编辑器桥接层在同一套 iframe 字段上挂载工具栏与键盘/鼠标行为，正式渲染器复用同一渲染函数。

**Tech Stack:** Vanilla JavaScript、同源 iframe、Node test runner、现有档案 CSS。

## Global Constraints

- 保持现有档案表单、正式排版、审核权限和旧版纯文本兼容。
- 正文标记只能产生 `<strong>` 和可聚焦遮蔽元素，禁止执行用户输入 HTML。
- 遮蔽内容默认隐藏，鼠标悬停、键盘聚焦和移动端点击显示。

---

### Task 1: 建立行内标记纯函数与文档字段

**Files:**
- Create: `src/archive-workflow/inline-text-format.js`
- Modify: `src/archive-workflow/editor-document.js`
- Test: `tests/inline-text-format.test.mjs`
- Test: `tests/editor-document.test.mjs`

**Interfaces:**
- `normalizeInlineMarks(marks, textLength)` returns bounded, non-overlapping mark ranges.
- `renderInlineText(text, marks)` returns escaped safe HTML.
- `extractInlineText(root)` returns `{ text, marks }` from marked DOM text.
- `applyInlineMark(marks, start, end, type)` toggles `bold` or `redacted`.

- [ ] **Step 1: Write failing tests for mark ranges, escaping, and round-trip.**
- [ ] **Step 2: Run `node --test tests/inline-text-format.test.mjs tests/editor-document.test.mjs` and confirm missing exports fail.**
- [ ] **Step 3: Implement the pure functions and preserve `inlineMarks` in document normalization.**
- [ ] **Step 4: Rerun the focused tests and confirm pass.**

### Task 2: Connect editor toolbar to every editable archive field

**Files:**
- Modify: `src/archive-workflow/editor-bridge.js`
- Modify: `src/archive-workflow/workspace.js`
- Modify: `src/archive-workflow/workspace.css`
- Test: `tests/archive-editor-bridge.test.mjs`
- Test: `tests/clerk-workspace.test.mjs`

**Interfaces:**
- The bridge exposes `applyInlineFormat(type)` and `readTemplateDocument` preserves `inlineMarks`.
- Every editable `[data-save]` text field gets the same `B` and `█` controls without changing locked system fields.

- [ ] **Step 1: Add failing bridge tests for preserving marks and toolbar hooks.**
- [ ] **Step 2: Run the focused bridge/workspace tests and confirm failure.**
- [ ] **Step 3: Add selection-aware formatting, safe DOM write/read, keyboard focus support, and retro toolbar styling.**
- [ ] **Step 4: Rerun focused tests and confirm all pass.**

### Task 3: Render marked text in public records and amendment history

**Files:**
- Modify: `src/archive-workflow/public-renderer.js`
- Modify: `src/archive-workflow/publication.js`
- Modify: `src/style.css`
- Test: `tests/archive-public-renderer.test.mjs`
- Test: `tests/archive-publication.test.mjs`

**Interfaces:**
- Public rendering uses `renderInlineText` for field values and section prose while retaining escaped plain-text behavior for unmarked values.
- Amendment merges retain `inlineMarks` per field, so history and current content show the same formatting.

- [ ] **Step 1: Add failing renderer tests for `<strong>`, hidden redaction, hover/focus selectors, and amendment inheritance.**
- [ ] **Step 2: Run the focused renderer/publication tests and confirm failure.**
- [ ] **Step 3: Implement safe marked rendering and CSS for redaction reveal on hover/focus/click.**
- [ ] **Step 4: Rerun focused tests and confirm pass.**

### Task 4: Full verification and commit

**Files:**
- Verify only the files listed above

- [ ] **Step 1: Run `npm.cmd test` and `npm.cmd run build`.**
- [ ] **Step 2: Run the UI checker against the editor and public record styles.**
- [ ] **Step 3: Commit only source, tests, and this plan.**
