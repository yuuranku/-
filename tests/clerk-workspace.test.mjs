import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const projectRoot = new URL('../', import.meta.url);

const [html, script, styles] = await Promise.all([
  readFile(new URL('index.html', projectRoot), 'utf8'),
  readFile(new URL('src/main.js', projectRoot), 'utf8'),
  readFile(new URL('src/style.css', projectRoot), 'utf8'),
]);

test('the taskbar session area opens the separate clerk workspace', () => {
  assert.match(html, /id="clerk-workspace-entry"[^>]+aria-controls="clerk-desktop"/);
  assert.match(html, /id="clerk-desktop"/);
  assert.match(script, /desktopEntry\.addEventListener\('click', \(\) => setDesktopOpen\(true\)\)/);
});

test('the PALIS mascot keeps its original assistant menu behavior', () => {
  assert.match(html, /id="mascot-trigger"[^>]+aria-controls="mascot-window"[^>]+aria-label="打开 PALIS 助手"/);
  assert.match(script, /trigger\.addEventListener\('click', \(\) => setMenuOpen\(startMenu\.hidden\)\)/);
});

test('assistant files and workspace files use independent window surfaces', () => {
  assert.match(script, /const documentKey = `\$\{surface\}:\$\{documentId\}`/);
  assert.match(script, /surface === 'workspace' \? desktopWindowLayer : archiveWindowLayer/);
  assert.match(script, /openDocument\(entry\.dataset\.mascotDocument, entry, 'workspace'\)/);
});

test.skip('legacy clerk labels have been replaced by explicit pen names', () => {
  assert.match(script, /documentId: 'clerk-wei-yi', entry: '助理书记官 魏伊', title: '助理书记官 · 魏伊'/);
  assert.match(script, /documentId: 'clerk-yinnar-light', entry: '助理书记官 主行', title: '助理书记官 · 主行'/);
  assert.match(html, /data-mascot-document-content="clerk-yinnar-light"[\s\S]*?<h2>助理书记官 · 主行<\/h2>/);
});

test('recorded clerks use pen names and the second clerk is a trainee clerk', () => {
  assert.match(script, /\u7b14\u540d\uff1a\u9b4f\u4f0a/);
  assert.match(script, /\u7b14\u540d\uff1a\u4e3b\u884c/);
  assert.match(script, /title: '\u89c1\u4e60\u4e66\u8bb0\u5b98\s*\u00b7\s*\u7b14\u540d\uff1a\u4e3b\u884c'/);
  assert.match(html, /<h2>\u89c1\u4e60\u4e66\u8bb0\u5b98\s*\u00b7\s*\u7b14\u540d\uff1a\u4e3b\u884c<\/h2>/);
});

test('the clerk desktop exposes the nine archive template shortcuts', () => {
  const desktopMarkup = html.slice(
    html.indexOf('<nav class="clerk-desktop__icons"'),
    html.indexOf('</nav>', html.indexOf('<nav class="clerk-desktop__icons"')),
  );

  assert.deepEqual(
    [...desktopMarkup.matchAll(/data-archive-template="(\d{2})"/g)].map((match) => match[1]),
    ['01', '02', '03', '04', '05', '06', '07', '08', '09'],
  );
  assert.equal((desktopMarkup.match(/data-clerk-desktop-entry/g) || []).length, 9);
});

test('0.1 colors remain small decorative marks on a flat workspace surface', () => {
  const refinement = styles.slice(styles.indexOf('/* Clerk workspace refinement'));

  assert.match(refinement, /background:\s*var\(--clerk-surface\)/);
  assert.match(refinement, /\.clerk-desktop__marks/);
  assert.doesNotMatch(refinement, /ver-0-1-cover\.jpg/);
  assert.doesNotMatch(refinement, /radial-gradient|linear-gradient/);
});
