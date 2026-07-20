import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

function extractBlock(source, marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing ${marker}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(bodyStart + 1, index);
  }
  throw new Error(`unterminated block for ${marker}`);
}

const css = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');
const largeDesktop = extractBlock(css, '@media (min-width: 2000px) and (min-height: 1100px)');

test('2K overview fills the left workspace and enlarges system chrome', () => {
  assert.match(largeDesktop, /--taskbar-height:\s*calc\(52px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(largeDesktop, /\.capsule-copy\s*\{[^}]*width:\s*min\(900px,/s);
  assert.match(largeDesktop, /\.sync-mast,\s*\.sync-summary\s*\{[^}]*width:\s*min\(1040px,\s*45vw\)/s);
  assert.match(largeDesktop, /\.sync-mast h2\s*\{[^}]*font-size:\s*clamp\(72px,\s*3\.6vw,\s*88px\)/s);
  assert.match(largeDesktop, /\.sync-ledger\s*\{[^}]*width:\s*520px[^}]*height:\s*340px/s);
  assert.match(largeDesktop, /\.chapter-nav a\s*\{[^}]*width:\s*58px[^}]*height:\s*58px/s);
});

test('2K archive and polar panels grow with the available canvas', () => {
  assert.match(largeDesktop, /\.archive-window\s*\{[^}]*width:\s*min\(1280px,[^}]*height:\s*min\(940px,/s);
  assert.match(largeDesktop, /\.archive-heading h2\s*\{[^}]*font-size:\s*76px/s);
  assert.match(largeDesktop, /\.folder-button\s*\{[^}]*width:\s*196px[^}]*min-height:\s*152px/s);
  assert.match(largeDesktop, /\.polar-brand\s*\{[^}]*width:\s*460px/s);
  assert.match(largeDesktop, /\.map-layers\s*\{[^}]*width:\s*440px/s);
  assert.match(largeDesktop, /\.map-detail\s*\{[^}]*width:\s*500px/s);
  assert.match(largeDesktop, /\.polar-diagnostic\s*\{[^}]*width:\s*620px/s);
});
