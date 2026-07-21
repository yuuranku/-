import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildPeopleNetworkModel,
  getEcologySpecimenReading,
} from '../src/archive-layout.js';
import { ARCHIVE_ROOTS } from '../src/archive-data.js';

const peopleFixtures = Array.from({ length: 32 }, (_, index) => ({
  code: `P${String(index + 1).padStart(2, '0')}`,
  name: `人员 ${index + 1}`,
  meta: `${index < 9 ? '昆仑工程' : index < 19 ? 'BAS' : index < 27 ? 'USVR' : 'HZ-6'} / 人员卷`,
  fields: [
    ['体系', index < 9 ? '昆仑工程' : index < 19 ? 'BAS' : index < 27 ? 'USVR' : 'HZ-6'],
    ['职务', index % 3 === 0 ? '负责人' : index % 3 === 1 ? '科学顾问' : '野外队员'],
  ],
}));

test('people network exposes a stable twelve-person neighborhood without hidden-card animation state', () => {
  const model = buildPeopleNetworkModel(peopleFixtures, 29);
  const visibleIds = new Set(model.nodes.map((node) => node.code));
  const positions = new Set(model.nodes.map((node) => `${node.x.toFixed(3)}:${node.y.toFixed(3)}`));

  assert.equal(model.nodes.length, 12);
  assert.equal(model.nodes.filter((node) => node.selected).length, 1);
  assert.equal(model.nodes.find((node) => node.selected)?.code, 'P30');
  assert.equal(positions.size, model.nodes.length, 'every visible node should receive a unique position');
  assert.ok(model.links.length >= 11);
  model.links.forEach((link) => {
    assert.ok(visibleIds.has(link.source), `missing visible source ${link.source}`);
    assert.ok(visibleIds.has(link.target), `missing visible target ${link.target}`);
  });

  const broadModel = buildPeopleNetworkModel(peopleFixtures, 0);
  assert.ok(
    broadModel.nodes.filter((node) => node.system === '昆仑工程').length <= 6,
    'the network should preserve cross-system relationships instead of becoming a single-team fan',
  );
});

test('event drawer holds all twenty-six pockets filed in chronological order', () => {
  const events = ARCHIVE_ROOTS.find((root) => root.id === 'events').children;

  assert.equal(events.length, 26);
  assert.equal(new Set(events.map((event) => event.code)).size, 26);
  const startYear = (year) => parseInt(String(year).match(/\d{4}/)?.[0] ?? '1965', 10);
  const years = events.map((event) => startYear(event.year));
  years.slice(1).forEach((year, index) => {
    assert.ok(year >= years[index], `pockets should be filed chronologically near ${events[index + 1].code}`);
  });
  assert.equal(events[0].code, 'V16');
  assert.equal(events.at(-1).code, 'V09');
});

test('every entrance carries the survey fields the section drawings are generated from', () => {
  const entries = ARCHIVE_ROOTS.find((root) => root.id === 'entrances').children;

  assert.equal(entries.length, 18);
  entries.forEach((entry) => {
    assert.ok(entry.network, `${entry.code} should carry an authority network`);
    assert.ok(entry.type, `${entry.code} should carry a passage class`);
    const fields = Object.fromEntries(entry.fields || []);
    const surfaceEntries = entry.type.includes('地表');
    if (!surfaceEntries) {
      const descent = ['下降', '井径', '井筒', '开口', '井口', '套管'].map((key) => fields[key] || '').join('');
      assert.ok(descent.length > 0, `${entry.code} needs a descent or bore field for its drawing`);
    }
  });
  const measured = entries.filter((entry) => {
    const fields = Object.fromEntries(entry.fields || []);
    return /[\d.]+\s*(米|公里)/.test(fields['下降'] || '');
  });
  assert.ok(measured.length >= 14, 'most descents should provide a parsable depth or route length');
});

test('ecology cabinet provides seven distinct specimen drawer readings', () => {
  const readings = Array.from({ length: 7 }, (_, index) => getEcologySpecimenReading(index));

  assert.equal(new Set(readings.map((reading) => reading.sample)).size, 7);
  readings.forEach((reading, index) => {
    assert.equal(reading.layer, index + 1);
    assert.match(reading.depth, /m|以下/);
    assert.ok(reading.temperature.length > 0);
    assert.ok(reading.hazard.length > 0);
    assert.ok(reading.materials.length >= 2);
  });
});

test('approved archive counts include the expanded sixteen-event chronology', () => {
  const counts = Object.fromEntries(ARCHIVE_ROOTS.map((root) => [root.id, root.children.length]));

  assert.equal(counts.people, 32);
  assert.equal(counts.events, 26);
  assert.equal(counts.entrances, 18);
  assert.equal(counts.ecology, 7);
});

test('every event dossier has complete chronology metadata', () => {
  const events = ARCHIVE_ROOTS.find((root) => root.id === 'events').children;

  events.forEach((event) => {
    assert.match(event.code, /^V\d{2}$/);
    assert.ok(event.year?.length > 0, `${event.code} is missing a year`);
    assert.ok(event.body?.length > 0, `${event.code} is missing a body`);
    assert.ok(event.meta?.length > 0, `${event.code} is missing a status`);
  });
});

test('approved C C B B directory renderers are wired into the live archive page', async () => {
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

  assert.match(source, /events:\s*'case-chronology'/);
  assert.match(source, /function buildPeopleNetwork\(/);
  assert.match(source, /function buildEventChronology\(/);
  assert.match(source, /function buildEntranceElevation\(/);
  assert.match(source, /function buildEcologyCabinet\(/);
  assert.match(source, /entranceSheetMarkup/);
  assert.match(source, /function renderEventChronology\(/);
  assert.match(source, /ev-directory/);
  assert.match(source, /eco-log-svg/);
  assert.doesNotMatch(source, /I \/ 起源卷|II \/ 扩张卷|III \/ 封存卷/);
  assert.doesNotMatch(source, /ecology-specimen-plate/);
  assert.doesNotMatch(source, /classList\.toggle\('is-off-deck'/);
});

test('new directory layouts include their responsive workbench styling', async () => {
  const styles = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');

  assert.match(styles, /\.people-network-workbench/);
  assert.match(styles, /\.entrance-sheet-console/);
  assert.match(styles, /\.eco-log-console/);
  assert.match(styles, /\.ev-cabinet\s*\{/);
  assert.match(styles, /--archive-ui-label:\s*clamp\(12px,/);
  assert.match(styles, /--archive-ui-body:\s*clamp\(15px,/);
  assert.match(styles, /\.directory-open-button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(styles, /\.ev-directory/);
  assert.match(styles, /\.ev-record\s*\{/);
  assert.match(styles, /\.entrance-sheet-drawer/);
  assert.match(styles, /\.eco-log-bands/);
  assert.match(styles, /\.archive-layer\.has-directory \.folder-orbit\.mode-entrance-network/);
  assert.match(styles, /display: block !important/);
  assert.match(styles, /width: calc\(100vw - 24px\) !important/);
  assert.match(styles, /@media\s*\(min-width:\s*2000px\)/);
});
