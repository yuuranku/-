import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('event plane keeps a centered desktop frame on extra-wide screens', async () => {
  const styles = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');

  assert.match(
    styles,
    /\.folder-orbit\.mode-event-plane\s*\{[^}]*right:\s*auto;[^}]*left:\s*50%;[^}]*width:\s*min\(1740px,\s*calc\(100vw\s*-\s*148px\)\);[^}]*transform:\s*translateX\(-50%\);/s,
  );
});
