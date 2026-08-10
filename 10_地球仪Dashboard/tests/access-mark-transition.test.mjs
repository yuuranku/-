import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('access mark handoff keeps a sampled CRT afterimage trail during movement and zoom', async () => {
  const source = await readFile(new URL('../src/auth.js', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../src/auth.css', import.meta.url), 'utf8');

  assert.match(source, /createAccessMarkTrail/);
  assert.match(source, /trail\?\.capture/);
  assert.match(source, /trail\?\.destroy/);
  assert.match(styles, /\.access-mark-trail-layer/);
  assert.match(styles, /\.access-mark-trail/);
});
