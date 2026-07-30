import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeArchiveIndexData,
  renderArchiveIndexFields,
  validateArchiveIndexData,
} from '../src/archive-workflow/index-fields.js';
import { ARCHIVE_CATEGORY_PROFILES } from '../src/archive-workflow/category-profiles.js';

const EXPECTED_KEYS = Object.freeze({
  country: ['title', 'archivePeriod', 'bloc'],
  organization: ['title', 'channel', 'foundedAt'],
  station: ['title', 'latitude', 'longitude', 'owner', 'stationType', 'status'],
  entrance: ['title', 'latitude', 'longitude', 'owner', 'entranceType', 'status', 'hazard'],
  ecology: ['title', 'recordType', 'firstObservedAt', 'scope', 'status'],
  person: ['title', 'archiveChain', 'organization', 'role', 'activePeriod', 'status'],
  event: ['title', 'startDate', 'endDate', 'timePrecision', 'location', 'reviewStatus'],
  anomaly: ['title', 'anomalyKind', 'parentEvent', 'occurredAt', 'location', 'anomalyType', 'severity', 'status'],
  species: ['title', 'specimenClass', 'discoveredAt', 'location', 'specimenStatus', 'hazard'],
});

test('all nine category profiles expose the approved public index keys', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(ARCHIVE_CATEGORY_PROFILES).map(([category, profile]) => [
      category,
      profile.indexFields.map(({ key }) => key),
    ])),
    EXPECTED_KEYS,
  );
});

test('organizations use one required red, blue, or neutral classification outside the formal document', () => {
  const channel = ARCHIVE_CATEGORY_PROFILES.organization.indexFields.find(({ key }) => key === 'channel');
  const invalid = validateArchiveIndexData('organization', {
    title: '\u5185\u9646\u7279\u522b\u4f5c\u4e1a\u5c40', channel: 'unknown', foundedAt: '1949',
  });

  assert.equal(channel.type, 'select');
  assert.deepEqual(channel.options.map(({ value }) => value), ['red', 'blue', 'neutral']);
  assert.equal(invalid.valid, false);
  assert.deepEqual(invalid.missing, ['channel']);
});

test('normalization keeps only category index fields and converts controlled values', () => {
  assert.deepEqual(normalizeArchiveIndexData('species', {
    title: '  白壳复合体  ',
    specimenClass: ' flora ',
    discoveredAt: '1963-08-31',
    location: '白幕三号层',
    specimenStatus: '活体',
    hazard: '低',
    ignored: 'not persisted',
  }), {
    title: '白壳复合体',
    specimenClass: 'FLORA',
    discoveredAt: '1963-08-31',
    location: '白幕三号层',
    specimenStatus: '活体',
    hazard: '低',
  });
});

test('species class is controlled and event end date remains optional', () => {
  const invalidSpecies = validateArchiveIndexData('species', {
    title: '白壳复合体',
    specimenClass: 'UNKNOWN',
    discoveredAt: '1963',
    location: '白幕',
    specimenStatus: '已收录',
    hazard: '低',
  });
  assert.equal(invalidSpecies.valid, false);
  assert.deepEqual(invalidSpecies.missing, ['specimenClass']);

  const event = validateArchiveIndexData('event', {
    title: '白幕初垂',
    startDate: '1963-08-31',
    endDate: '',
    timePrecision: 'DAY',
    location: '南极大陆',
    reviewStatus: 'CONFIRMED',
  });
  assert.equal(event.valid, true);
  assert.equal(event.value.endDate, '');

  const noStart = validateArchiveIndexData('event', {
    ...event.value,
    startDate: '',
  });
  assert.equal(noStart.valid, false);
  assert.deepEqual(noStart.missing, ['startDate']);
});

test('station and entrance coordinates require finite values in geographic ranges', () => {
  const validStation = validateArchiveIndexData('station', {
    title: '西线营地',
    latitude: '-77.8419',
    longitude: '166.6863',
    owner: 'PALIS',
    stationType: '常设站',
    status: '运行',
  });
  assert.equal(validStation.valid, true);
  assert.equal(validStation.value.latitude, -77.8419);
  assert.equal(validStation.value.longitude, 166.6863);

  const invalidEntrance = validateArchiveIndexData('entrance', {
    title: '白幕入口',
    latitude: '91',
    longitude: 'not-a-number',
    owner: 'PALIS',
    entranceType: '冰裂隙',
    status: '封闭',
    hazard: '高',
  });
  assert.equal(invalidEntrance.valid, false);
  assert.deepEqual(invalidEntrance.missing, ['latitude', 'longitude']);
});

test('generated index controls expose labels, keys, select options, and errors', () => {
  const species = renderArchiveIndexFields('species', {
    title: '白壳虫',
    specimenClass: 'FAUNA',
  });
  assert.match(species, /data-archive-index-panel/);
  assert.match(species, /data-archive-index-field="title"/);
  assert.match(species, /name="index:specimenClass"/);
  assert.match(species, /<select[^>]+data-index-key="specimenClass"/);
  assert.match(species, /value="FAUNA" selected/);
  assert.match(species, /植物／动物/);
  assert.doesNotMatch(species, /COMPOSITE|复合群落/);
  assert.match(species, /data-index-errors/);
});
