import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildPeopleNetworkModel,
  getEcologySpecimenReading,
} from '../src/archive-layout.js';
import { ARCHIVE_ROOTS } from '../src/archive-data.js';
import { ARCHIVE_LONGFORM } from '../src/archive-longform.js';

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

test('event plane keeps HZ-6 as EV01 and reserves the later event positions', () => {
  const events = ARCHIVE_ROOTS.find((root) => root.id === 'events').children;

  assert.equal(events.length, 1);
  assert.deepEqual(events.map((event) => event.code), ['EV01']);
  assert.equal(events[0].name, 'HZ-6 / 样本线任务');
  assert.ok(events[0].webContent, 'the available HZ-6 record should be first');
});

test('the first anomaly dossier is available as the public incident-trace layout preview', () => {
  const anomalies = ARCHIVE_ROOTS.find((root) => root.id === 'abnormalities').children;
  const preview = anomalies.find((record) => record.code === 'A01');

  assert.deepEqual(anomalies.map((record) => record.code), ['A01', 'A02', 'A03']);
  assert.ok(preview?.webContent, 'A01 should open its existing formal anomaly dossier');
  assert.equal(preview.recordType, 'incident-trace');
  assert.ok(preview.longform?.blocks?.length, 'A01 should retain its existing report content');
});

test('every country registry is online so its original record can be opened and amended', () => {
  const countries = ARCHIVE_ROOTS.find((root) => root.id === 'countries').children;

  assert.ok(countries.length > 0);
  assert.ok(
    countries.every((record) => record.webContent),
    'every country registry should open its original document instead of the offline cover',
  );
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

test('station and entrance dossiers are all available in the public archive', () => {
  const stations = ARCHIVE_ROOTS.find((root) => root.id === 'stations').children;
  const entrances = ARCHIVE_ROOTS.find((root) => root.id === 'entrances').children;

  assert.ok(stations.length > 0);
  assert.ok(entrances.length > 0);
  assert.ok(stations.every((record) => record.webContent), 'every research station should open online');
  assert.ok(entrances.every((record) => record.webContent), 'every White Abyss entrance should open online');
});

test('the seven original ecology strata are online and retain their field-log base', () => {
  const ecology = ARCHIVE_ROOTS.find((root) => root.id === 'ecology').children;

  assert.equal(ecology.length, 7);
  assert.ok(ecology.every((record) => record.webContent), 'every original stratum should open online');
  assert.deepEqual(ecology.map(({ code }) => code), ['E01', 'E02', 'E03', 'E04', 'E05', 'E06', 'E07']);
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

test('species archives retain Chinese directory names and original formal taxonomic names', () => {
  const speciesRoot = ARCHIVE_ROOTS.find(({ code }) => code === '09');
  const entries = speciesRoot?.children ?? [];

  assert.equal(entries.length, 22);
  assert.deepEqual(
    ['S01', 'S02', 'S03'].map((code) => entries.find((entry) => entry.code === code)?.name),
    ['黑针木', '银皮冷杉', '玻璃苔'],
  );
  assert.ok(entries.every(({ name }) => !/[A-Za-z]/.test(name)));
  assert.ok(entries.every(({ webContent }) => webContent));
  const formalTitles = entries.map(({ code }) => ARCHIVE_LONGFORM.species[code]?.title);
  assert.deepEqual(formalTitles.slice(0, 3), [
    'Abyssodendron aciculatum',
    'Argenteofrutex glacialis',
    'Hyalobryum recurvatum',
  ]);
  assert.ok(formalTitles.every((title) => /[A-Za-z]/.test(title)));
});

test('approved archive counts include the current personnel and event records', () => {
  const counts = Object.fromEntries(ARCHIVE_ROOTS.map((root) => [root.id, root.children.length]));

  assert.equal(counts.people, 36);
  assert.equal(counts.events, 1);
  assert.equal(counts.abnormalities, 3);
  assert.equal(counts.entrances, 18);
  assert.equal(counts.ecology, 7);
});

test('every event dossier has complete chronology metadata', () => {
  const events = ARCHIVE_ROOTS.find((root) => root.id === 'events').children;

  events.forEach((event) => {
    assert.match(event.code, /^EV\d{2}$/);
    assert.ok(event.year?.length > 0, `${event.code} is missing a year`);
    assert.ok(event.body?.length > 0, `${event.code} is missing a body`);
    assert.ok(event.meta?.length > 0, `${event.code} is missing a status`);
  });
});

test('people relationship nodes are generated from the personnel directory entries', async () => {
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

  const peopleRenderer = source.match(/function buildPeopleNetwork\([\s\S]*?\n}\r?\n\r?\nfunction renderPeopleNetwork/);
  assert.ok(peopleRenderer, 'people network renderer should be present');
  assert.match(peopleRenderer[0], /const buttons = entries\.map\(\(archive, index\) =>/);
});

test('current directory renderers are wired into the live archive page', async () => {
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

  assert.match(source, /events:\s*'event-plane'/);
  assert.match(source, /function buildPeopleNetwork\(/);
  assert.match(source, /function buildEventPlane\(/);
  assert.match(source, /function buildEntranceElevation\(/);
  assert.match(source, /function buildEcologyCabinet\(/);
  assert.match(source, /entranceSheetMarkup/);
  assert.match(source, /function resetEventPlane\(/);
  assert.match(source, /event-plane-world/);
  assert.match(source, /eco-log-svg/);
  assert.match(source, /eco-log-additions/);
  assert.match(source, /const strataEntries = entries\.slice\(0, 7\)/);
  assert.match(source, /const buttons = strataEntries\.map\(\(archive, index\) =>/);
  assert.doesNotMatch(source, /增补生态记录/);
  assert.doesNotMatch(source, /I \/ 起源卷|II \/ 扩张卷|III \/ 封存卷/);
  assert.doesNotMatch(source, /ecology-specimen-plate/);
  assert.doesNotMatch(source, /classList\.toggle\('is-off-deck'/);
  assert.match(source, /archive-new-badge/);
  assert.match(source, /archive\.isNew/);
  assert.doesNotMatch(source, /archive\?\.code\s*\|\|\s*`S\$\{/);
});

test('new directory layouts include their responsive workbench styling', async () => {
  const styles = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');

  assert.match(styles, /\.people-network-workbench/);
  assert.match(styles, /\.entrance-sheet-console/);
  assert.match(styles, /\.eco-log-console/);
  assert.match(styles, /\.event-plane\s*\{/);
  assert.match(styles, /--archive-ui-label:\s*clamp\(12px,/);
  assert.match(styles, /--archive-ui-body:\s*clamp\(15px,/);
  assert.match(styles, /\.directory-open-button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(styles, /\.event-plane-world/);
  assert.match(styles, /\.mode-event-plane \.folder-button\s*\{/);
  assert.match(styles, /\.entrance-sheet-drawer/);
  assert.match(styles, /\.eco-log-bands/);
  assert.match(styles, /\.eco-log-additions__list\s*\{[^}]*display:\s*grid/s);
  assert.match(styles, /\.eco-log-additions \.folder-button\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(styles, /\.archive-layer\.has-directory \.folder-orbit\.mode-entrance-network/);
  assert.match(styles, /display: block !important/);
  assert.match(styles, /width: calc\(100vw - 24px\) !important/);
  assert.match(styles, /@media\s*\(min-width:\s*2000px\)/);
  assert.match(styles, /\.archive-new-badge/);
});

test('ecology additions sit below a fully readable field card', async () => {
  const [source, styles] = await Promise.all([
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/style.css', import.meta.url), 'utf8'),
  ]);

  assert.match(source, /has-ecology-additions[\s\S]*\?\s*34\s*:/);
  assert.match(styles, /\.eco-log-additions\s*\{[^}]*top:\s*64%;/s);
  assert.match(styles, /\.eco-log-console\.has-ecology-additions \.eco-log-card\s*\{[^}]*max-height:\s*none;[^}]*overflow:\s*visible;/s);
});
