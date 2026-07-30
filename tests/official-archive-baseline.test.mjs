import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

import {
  buildOfficialWorkspaceBaselines,
  hydrateOfficialWorkspaceBaselines,
} from '../src/archive-workflow/official-archive-baseline.js';
import { ARCHIVE_ROOTS } from '../src/archive-data.js';
import { createEmptyLocalState } from '../src/archive-workflow/local/local-state.js';

test('every original archive category has a workbench baseline', () => {
  const baselines = buildOfficialWorkspaceBaselines();
  const expectedCategories = [
    'country', 'organization', 'station', 'entrance', 'ecology',
    'person', 'event', 'anomaly', 'species',
  ];
  const expectedCount = ARCHIVE_ROOTS.reduce((total, root) => total + root.children.length, 0);

  assert.deepEqual(
    [...new Set(baselines.map(({ category }) => category))].sort(),
    [...expectedCategories].sort(),
  );
  assert.equal(baselines.length, expectedCount);
});

test('official country, station, entrance, ecology, and species records become public editable workspace archives', () => {
  const baselines = buildOfficialWorkspaceBaselines();
  const countries = baselines.filter(({ category }) => category === 'country');
  const stations = baselines.filter(({ category }) => category === 'station');
  const entrances = baselines.filter(({ category }) => category === 'entrance');
  const ecology = baselines.filter(({ category }) => category === 'ecology');
  const species = baselines.filter(({ category }) => category === 'species');

  assert.equal(countries.length, 18);
  assert.ok(countries.some(({ code }) => code === 'N16'));
  assert.equal(stations.length, 20);
  assert.equal(entrances.length, 18);
  assert.equal(ecology.length, 7);
  assert.ok(ecology.some(({ code }) => code === 'E04'));
  assert.equal(species.length, 22);
  assert.equal(species.find(({ code }) => code === 'S01')?.title, '黑针木');
  assert.ok(baselines.every(({ origin, visibility }) => origin === 'official' && visibility === 'public'));
});

test('hydrating official baselines preserves existing records and remains idempotent', () => {
  const state = createEmptyLocalState();
  state.archives.push({ id: 'existing', code: 'US-MCM', title: 'Existing station' });
  const expectedRecordCount = ARCHIVE_ROOTS.reduce((total, root) => total + root.children.length, 0);

  const once = hydrateOfficialWorkspaceBaselines(state);
  const twice = hydrateOfficialWorkspaceBaselines(once);

  assert.equal(once.archives.length, expectedRecordCount);
  assert.equal(twice.archives.length, expectedRecordCount);
  assert.deepEqual(
    twice.archives.find(({ code }) => code === 'US-MCM'),
    { id: 'existing', code: 'US-MCM', title: 'Existing station' },
  );
  assert.ok(twice.archives.some(({ code }) => code === 'N16'));
  assert.ok(twice.archives.some(({ code }) => code === 'E04'));
  assert.ok(twice.archives.some(({ code }) => code === 'S01'));
});

test('static archive seed generator emits every original archive as an idempotent server baseline', () => {
  const result = spawnSync(process.execPath, ['scripts/generate-static-archive-seed.mjs', '--stdout'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  const sql = result.stdout;
  for (const { code } of buildOfficialWorkspaceBaselines()) {
    assert.match(sql, new RegExp(`'${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  }
  assert.match(sql, /'official'/);
  assert.match(sql, /case when exists \(\s*select 1\s*from public\.archives sequence_conflict/i);
  assert.match(sql, /'1957-01-01T00:00:00\.000Z'::timestamptz/);
  assert.match(sql, /on conflict \(code\) do nothing/i);
});

test('archive synchronization accepts the complete anomaly source manuscript', () => {
  const result = spawnSync(process.execPath, ['scripts/generate-archive-longform.mjs'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).abnormalities, 25);
});

test('production migration seeds official species archives without replacing existing work', async () => {
  const migration = await readFile(
    new URL('../supabase/migrations/202607300009_seed_static_species_archives.sql', import.meta.url),
    'utf8',
  );

  assert.match(migration, /'S01',\s*'species',\s*'黑针木'/);
  assert.match(migration, /on conflict \(code\) do nothing/i);
});

test('production migration seeds official ecology records without replacing existing work', async () => {
  const migration = await readFile(
    new URL('../supabase/migrations/202607300006_seed_static_ecology_archives.sql', import.meta.url),
    'utf8',
  );

  assert.match(migration, /\('E01', 'ecology'/);
  assert.match(migration, /\('E07', 'ecology'/);
  assert.match(migration, /'public'/);
  assert.match(migration, /'official'/);
  assert.match(migration, /on conflict \(code\) do nothing/i);
});

test('production migration seeds official country archives without replacing existing work', async () => {
  const migration = await readFile(
    new URL('../supabase/migrations/202607300005_seed_static_country_archives.sql', import.meta.url),
    'utf8',
  );

  assert.match(migration, /\('N01', 'country'/);
  assert.match(migration, /\('N16', 'country'/);
  assert.match(migration, /'public'/);
  assert.match(migration, /'official'/);
  assert.match(migration, /on conflict \(code\) do nothing/i);
});
