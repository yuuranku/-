import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('polar map stations select on one click and open on the second click', async () => {
  const [source, markup] = await Promise.all([
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
  ]);

  assert.match(source, /selectedMapCode === item\.code && now - selectedMapAt < 380/);
  assert.match(source, /selectMapItem\(item\);[\s\S]*if \(isDoubleSelection\)[\s\S]*openMapArchive\(item\)/);
  assert.match(source, /new THREE\.SphereGeometry\(/);
  assert.match(source, /new THREE\.OctahedronGeometry\(/);
  assert.match(source, /polarDiagnosticComplete && marker\.userData\.item\?\.code === item\.code/);
  assert.match(source, /selectionHighlight\.visible = isSelected/);
  assert.match(markup, /单击坐标点选中 · 双击打开对应档案/);
});
