import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readProjectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('archive View menu exposes saved story titles and the add action', async () => {
  const [html, main] = await Promise.all([readProjectFile('index.html'), readProjectFile('src/main.js')]);

  assert.match(html, /data-archive-menu-trigger="view"/);
  assert.match(html, /data-archive-view-menu/);
  assert.match(main, /renderArchiveStoryMenu/);
  assert.match(main, /listArchiveStoryPages/);
  assert.match(main, /data-archive-story-action/);
  assert.match(main, /data-archive-story-page/);
});

test('story editor is a plain lined page with save, delete, and no rich-text controls', async () => {
  const [main, css] = await Promise.all([readProjectFile('src/main.js'), readProjectFile('src/style.css')]);

  assert.match(main, /archive-story-window/);
  assert.match(main, /data-archive-story-title/);
  assert.match(main, /applyTextareaTabIndent/);
  assert.match(main, /installArchiveStoryWindowDrag/);
  assert.match(main, /<textarea[^>]+data-archive-story-body/);
  assert.match(main, /保存修改|保存留言/);
  assert.match(main, /删除留言/);
  assert.doesNotMatch(main, /data-archive-story-(?:bold|image|reply|like)/);
  assert.match(css, /\.archive-story-paper/);
  assert.match(css, /repeating-linear-gradient/);
});
