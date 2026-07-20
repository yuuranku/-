import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildEventCabinetGroups,
  buildEntranceTopologyModel,
  buildEntranceFocusModel,
  buildPeopleNetworkModel,
  classifyEventPeriod,
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

test('event chronology classifies all three approved dossier periods', () => {
  assert.equal(classifyEventPeriod('1938—39'), 'early');
  assert.equal(classifyEventPeriod('1949'), 'early');
  assert.equal(classifyEventPeriod('1950'), 'middle');
  assert.equal(classifyEventPeriod('1955—56'), 'middle');
  assert.equal(classifyEventPeriod('1958'), 'late');
  assert.equal(classifyEventPeriod('六十年代中期'), 'late');
});

test('event cabinet keeps all sixteen files in four neutral date-range bays', () => {
  const events = ARCHIVE_ROOTS.find((root) => root.id === 'events').children;
  const groups = buildEventCabinetGroups(events, 4);

  assert.equal(groups.length, 4);
  assert.equal(groups.flatMap((group) => group.entries).length, 16);
  assert.deepEqual(groups.map((group) => group.label), ['1938—1948', '1949—1953', '1954—1958', '1960—六十年代中期']);
  assert.deepEqual(groups.flatMap((group) => group.entries.map(({ index }) => index)), events.map((_, index) => index));
  groups.forEach((group) => {
    assert.match(group.label, /\d|六十/);
    assert.doesNotMatch(group.label, /起源|扩张|封存/);
  });
});

test('entrance topology preserves every entrance and gives every node a connected route', () => {
  const networks = ['us', 'ussr', 'china', 'north', 'france', 'australia'];
  const types = [
    'B级人员货运井', 'A级重型入口', 'E级应急通道', 'D级仪器探井', 'C级阶梯井', '地表支援节点',
  ];
  const entries = Array.from({ length: 18 }, (_, index) => ({
    code: `K${String(index + 1).padStart(2, '0')}`,
    name: `入口 ${index + 1}`,
    network: networks[index % networks.length],
    type: types[index % types.length],
    status: index % 4 === 0 ? '限制访问' : '同期档案有效',
  }));
  const model = buildEntranceTopologyModel(entries);
  const linkedCodes = new Set(model.links.flatMap((link) => [link.source, link.target]));

  assert.equal(model.nodes.length, 18);
  assert.ok(model.sources.length >= 6);
  assert.ok(model.targets.length >= 3);
  model.nodes.forEach((node) => {
    assert.ok(['surface', 'descent', 'restricted'].includes(node.stage));
    assert.ok(linkedCodes.has(node.code), `expected ${node.code} to be connected`);
  });
  ['surface', 'descent', 'restricted'].forEach((stage) => {
    const positions = model.nodes.filter((node) => node.stage === stage).map((node) => node.y).sort((a, b) => a - b);
    positions.slice(1).forEach((position, index) => {
      assert.ok(position - positions[index] >= 5, `${stage} nodes should not collide vertically`);
    });
  });
});

test('entrance focus model enlarges one active route and a bounded set of useful alternatives', () => {
  const entries = ARCHIVE_ROOTS.find((root) => root.id === 'entrances').children;
  const topology = buildEntranceTopologyModel(entries);
  const focus = buildEntranceFocusModel(topology, 8, 7);

  assert.equal(focus.nodes.length, 7);
  assert.equal(focus.nodes.filter((node) => node.selected).length, 1);
  assert.equal(focus.nodes.find((node) => node.selected)?.index, 8);
  assert.ok(focus.source.label.length > 0);
  assert.ok(focus.target.label.length > 0);
  assert.equal(new Set(focus.nodes.map((node) => `${node.x}:${node.y}`)).size, focus.nodes.length);
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
  assert.equal(counts.events, 16);
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
  assert.match(source, /function buildEntranceTopology\(/);
  assert.match(source, /function buildEcologyCabinet\(/);
  assert.match(source, /event-drawer-cabinet/);
  assert.match(source, /entrance-topology-index/);
  assert.match(source, /focusLimit = window\.matchMedia\('\(max-width: 760px\)'\)\.matches \? 5 : 7/);
  assert.match(source, /ecology-sample-case/);
  assert.doesNotMatch(source, /I \/ 起源卷|II \/ 扩张卷|III \/ 封存卷/);
  assert.doesNotMatch(source, /ecology-specimen-plate/);
  assert.doesNotMatch(source, /classList\.toggle\('is-off-deck'/);
});

test('new directory layouts include their responsive workbench styling', async () => {
  const styles = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');

  assert.match(styles, /\.people-network-workbench/);
  assert.match(styles, /\.event-case-chronology/);
  assert.match(styles, /\.entrance-topology-console/);
  assert.match(styles, /\.ecology-specimen-cabinet/);
  assert.match(styles, /--archive-ui-label:\s*clamp\(12px,/);
  assert.match(styles, /--archive-ui-body:\s*clamp\(15px,/);
  assert.match(styles, /\.directory-open-button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(styles, /\.event-drawer-cabinet/);
  assert.match(styles, /\.entrance-topology-index/);
  assert.match(styles, /\.archive-layer\.has-directory \.folder-orbit\.mode-entrance-network/);
  assert.match(styles, /display: block !important/);
  assert.match(styles, /width: calc\(100vw - 24px\) !important/);
  assert.match(styles, /\.ecology-sample-case/);
  assert.match(styles, /@media\s*\(min-width:\s*2000px\)/);
});
