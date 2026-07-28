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

test('all recorded clerks use the simple assistant clerk pen-name format', () => {
  for (const name of ['魏伊', '主行', 'FourreTout', '精犬C']) {
    assert.match(script, new RegExp(`助理书记官：${name}`));
    assert.match(html, new RegExp(`<h2>助理书记官：${name}`));
  }
  assert.match(html, /data-mascot-document-content="clerk-jean-moreau"/);
  assert.match(html, /\/assets\/clerks\/jean-moreau-1\.png/);
  assert.match(html, /data-mascot-document-content="clerk-jing-quan-c"/);
  assert.match(html, /\/assets\/clerks\/jing-quan-c-profile\.png/);
  assert.doesNotMatch(script, /助理见习书记官|笔名：/);
  assert.doesNotMatch(script, /让·莫罗/);
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
