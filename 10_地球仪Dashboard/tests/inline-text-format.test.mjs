import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyInlineMark,
  normalizeInlineMarks,
  renderInlineText,
} from '../src/archive-workflow/inline-text-format.js';
import { normalizeEditorDocument } from '../src/archive-workflow/editor-document.js';

test('inline marks toggle bold and redaction within the selected range', () => {
  assert.deepEqual(applyInlineMark([], 2, 6, 'bold'), [{ start: 2, end: 6, bold: true }]);
  assert.deepEqual(applyInlineMark([{ start: 2, end: 6, bold: true }], 2, 6, 'bold'), []);
  assert.deepEqual(applyInlineMark([{ start: 2, end: 6, bold: true }], 3, 5, 'redacted'), [
    { start: 2, end: 3, bold: true },
    { start: 3, end: 5, bold: true, redacted: true },
    { start: 5, end: 6, bold: true },
  ]);
});

test('inline rendering escapes text and uses semantic markup for both effects', () => {
  assert.equal(
    renderInlineText('<机密>', [{ start: 0, end: 4, bold: true, redacted: true }]),
    '<strong><span class="archive-redacted" tabindex="0" role="button" aria-label="遮蔽文字">&lt;机密&gt;</span></strong>',
  );
});

test('inline marks are clipped to text length and discard empty ranges', () => {
  assert.deepEqual(normalizeInlineMarks([
    { start: -2, end: 2, bold: true },
    { start: 2, end: 9, redacted: true },
    { start: 4, end: 4, bold: true },
  ], 6), [
    { start: 0, end: 2, bold: true },
    { start: 2, end: 6, redacted: true },
  ]);
});

test('adjacent redaction ranges stay separate so each masked segment reveals independently', () => {
  const marks = normalizeInlineMarks([
    { start: 0, end: 2, redacted: true },
    { start: 2, end: 4, redacted: true },
  ], 4);
  assert.deepEqual(marks, [
    { start: 0, end: 2, redacted: true },
    { start: 2, end: 4, redacted: true },
  ]);
  assert.equal(
    renderInlineText('ABCD', marks).match(/class="archive-redacted"/g)?.length,
    2,
  );
});

test('multiline redactions render one mask per line instead of a full-width bar', () => {
  const html = renderInlineText('第一行\n第二行', [{ start: 0, end: 7, redacted: true }]);
  assert.equal(html.match(/class="archive-redacted"/g)?.length, 2);
  assert.equal(html.includes('<span class="archive-redacted" tabindex="0" role="button" aria-label="遮蔽文字">第一行</span><br><span class="archive-redacted" tabindex="0" role="button" aria-label="遮蔽文字">第二行</span>'), true);
});

test('editor documents preserve inline marks and keep old records compatible', () => {
  const normalized = normalizeEditorDocument({
    templateCode: '07',
    values: { hero: '任务' },
    inlineMarks: { hero: [{ start: 0, end: 2, bold: true }] },
  });
  assert.deepEqual(normalized.inlineMarks, { hero: [{ start: 0, end: 2, bold: true }] });
  assert.deepEqual(normalizeEditorDocument({ templateCode: '07', values: { hero: '旧档案' } }).inlineMarks, {});
});
