import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTextIndent, applyTextInputTabIndent, applyTextareaTabIndent } from '../src/archive-workflow/text-indent.js';

test('Tab indents the current paragraph with two full-width spaces', () => {
  assert.deepEqual(
    applyTextIndent({ value: '正文', selectionStart: 2, selectionEnd: 2, outdent: false }),
    { value: '　　正文', selectionStart: 4, selectionEnd: 4, changed: true },
  );
});

test('Tab indents every paragraph touched by a multi-line selection', () => {
  assert.deepEqual(
    applyTextIndent({ value: '甲\n乙\n丙', selectionStart: 1, selectionEnd: 3, outdent: false }),
    { value: '　　甲\n　　乙\n丙', selectionStart: 3, selectionEnd: 7, changed: true },
  );
});

test('Shift+Tab only removes a complete full-width paragraph indent', () => {
  assert.deepEqual(
    applyTextIndent({ value: '　　甲\n  乙', selectionStart: 0, selectionEnd: 7, outdent: true }),
    { value: '甲\n  乙', selectionStart: 0, selectionEnd: 5, changed: true },
  );
});

test('Tab updates an editable textarea and emits the existing input event', () => {
  const dispatched = [];
  const target = {
    value: '正文',
    selectionStart: 2,
    selectionEnd: 2,
    disabled: false,
    readOnly: false,
    matches: (selector) => selector === 'textarea',
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
    dispatchEvent: (event) => dispatched.push(event),
  };
  let prevented = false;

  assert.equal(applyTextareaTabIndent({ key: 'Tab', shiftKey: false, target, preventDefault: () => { prevented = true; } }), true);
  assert.equal(target.value, '　　正文');
  assert.deepEqual([target.selectionStart, target.selectionEnd], [4, 4]);
  assert.equal(prevented, true);
  assert.equal(dispatched[0]?.type, 'input');
  assert.equal(dispatched[0]?.bubbles, true);
});

test('Tab also applies the shared indent rule to a single-line text input', () => {
  const target = {
    value: '标题', selectionStart: 0, selectionEnd: 0, disabled: false, readOnly: false,
    matches: (selector) => selector === 'input[type="text"]',
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
    dispatchEvent: () => {},
  };
  assert.equal(applyTextInputTabIndent({ key: 'Tab', shiftKey: false, target, preventDefault() {} }), true);
  assert.equal(target.value, '　　标题');
});
