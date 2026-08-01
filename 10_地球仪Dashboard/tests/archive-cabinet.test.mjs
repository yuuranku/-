import assert from 'node:assert/strict';
import test from 'node:test';

import {
  archiveCabinetEntries,
  renderArchiveCabinet,
} from '../src/archive-workflow/archive-cabinet.js';

test('archive cabinet keeps all nine registered categories in their registry order', () => {
  assert.deepEqual(
    archiveCabinetEntries('admin').map((entry) => entry.code),
    ['01', '02', '03', '04', '05', '06', '07', '08', '09'],
  );
});

test('clerk cabinet starts new drafts in all nine archive categories', () => {
  const entries = archiveCabinetEntries('clerk');
  for (const code of ['01', '02', '03', '04', '05', '06', '07', '08', '09']) {
    const entry = entries.find((item) => item.code === code);
    assert.equal(entry.defaultKind, 'new');
    assert.equal(entry.restricted, false);
    assert.equal(entry.actionLabel, '可新建、补充／修改');
  }
});

test('administrator cabinet renders selectable folders and permission controls', () => {
  const cabinet = renderArchiveCabinet('admin');
  assert.equal((cabinet.match(/data-archive-template="\d{2}"/g) || []).length, 9);
  assert.match(cabinet, /可新建、补充／修改／设定/);
  assert.match(cabinet, /C:\\PALIS\\ARCHIVES/);
  assert.match(cabinet, /data-cabinet-menu="file"/);
  assert.match(cabinet, /data-cabinet-permissions/);
});
