import assert from 'node:assert/strict';
import test from 'node:test';

import { ARCHIVE_ROOTS } from '../src/archive-data.js';
import { getArchiveCategoryProfile } from '../src/archive-workflow/category-profiles.js';
import { mergePublishedArchiveDirectory } from '../src/archive-workflow/directory.js';
import { projectPublishedArchive } from '../src/archive-workflow/index-projector.js';
import { getNativeFormProfile, renderNativeArchiveForm } from '../src/archive-workflow/native-form-profiles.js';

const identityCases = [
  ['country', 19, 'N19', '019.REG'],
  ['organization', 25, 'O25', '025.CHN'],
  ['station', 21, 'ST21', '021.LOG'],
  ['entrance', 19, 'EN19', '019.CRD'],
  ['ecology', 8, 'E08', '008.ECO'],
  ['person', 47, 'P47', '047.PER'],
  ['event', 2, 'EV02', '002.RLL'],
  ['anomaly', 4, 'A04', '004.TRC'],
  ['species', 23, 'S23', '023.SPC'],
];

test('all nine published projections use their registered code and formal filename', () => {
  for (const [category, sequenceNumber, code, formalNumber] of identityCases) {
    const projected = projectPublishedArchive({
      id: `database-${category}`,
      code: `AUTO:${category}-uuid`,
      business_code: 'LEGACY-ALIAS',
      category,
      title: `${category} title`,
      visibility: 'public',
      sequence_number: sequenceNumber,
      new_badge_visible: true,
      index_payload: { title: `${category} index title` },
    });
    assert.equal(projected.code, code, `${category} directory code`);
    assert.equal(projected.formalNumber, formalNumber, `${category} formal number`);
    assert.equal(projected.file, `${formalNumber}.HTML`, `${category} filename`);
    assert.equal(projected.name, `${category} index title`);
    assert.equal(projected.isNew, true);
    assert.doesNotMatch(projected.code, /AUTO:|uuid/i);
  }
});

test('category index data projects into existing event, species, and station renderer fields', () => {
  const event = projectPublishedArchive({
    id: 'event-27',
    category: 'event',
    title: '数据库旧标题',
    visibility: 'public',
    sequence_number: 27,
    index_payload: {
      title: '白幕初垂',
      startDate: '1963-08-31',
      endDate: '',
      timePrecision: 'DAY',
      location: '南极大陆',
      reviewStatus: 'CONFIRMED',
    },
  });
  assert.equal(event.year, '1963-08-31');
  assert.equal(event.eventDate, '1963-08-31');
  assert.equal(event.location, '南极大陆');

  const eventWithCover = projectPublishedArchive({
    id: 'event-28',
    category: 'event',
    title: '带封面的事件',
    visibility: 'public',
    sequence_number: 28,
    cover_url: 'https://signed.example/event-cover.webp',
    index_payload: {
      title: '带封面的事件',
      startDate: '1964',
      timePrecision: 'YEAR',
      location: '南极大陆',
      reviewStatus: 'CONFIRMED',
    },
  });
  assert.equal(eventWithCover.image, 'https://signed.example/event-cover.webp');

  const species = projectPublishedArchive({
    id: 'species-23',
    category: 'species',
    title: '白壳复合体',
    visibility: 'public',
    sequence_number: 23,
    index_payload: {
      title: '白壳复合体',
      specimenClass: 'FLORA',
      discoveredAt: '1963',
      location: '白幕三号层',
      specimenStatus: '活体',
      hazard: '低',
    },
  });
  assert.equal(species.specimenClass, 'FLORA');
  assert.equal(species.hazard, '低');

  const station = projectPublishedArchive({
    id: 'station-21',
    category: 'station',
    title: '西线营地',
    visibility: 'public',
    sequence_number: 21,
    index_payload: {
      title: '西线营地',
      latitude: -77.8419,
      longitude: 166.6863,
      owner: 'PALIS',
      stationType: '常设站',
      status: '运行',
    },
  });
  assert.equal(station.lat, -77.8419);
  assert.equal(station.lng, 166.6863);
  assert.equal(station.operator, 'PALIS');
});

test('published cloud files append after static files in ascending registered order', () => {
  const base = [{
    id: 'species',
    children: [
      { id: 'static-1', code: 'S01', name: '静态一' },
      { id: 'static-2', code: 'S02', name: '静态二' },
    ],
  }];
  const cloud = [
    {
      id: 'cloud-24',
      category: 'species',
      title: '新增二',
      visibility: 'public',
      sequence_number: 24,
      index_payload: { title: '新增二', specimenClass: 'FAUNA' },
    },
    {
      id: 'cloud-23',
      category: 'species',
      title: '新增一',
      visibility: 'public',
      sequence_number: 23,
      index_payload: { title: '新增一', specimenClass: 'FLORA' },
    },
  ];

  assert.deepEqual(
    mergePublishedArchiveDirectory(base, cloud)
      .find(({ id }) => id === 'species').children.map(({ code }) => code),
    ['S01', 'S02', 'S23', 'S24'],
  );
});

test('official ecology records with renumbered server codes do not enter the new-record list', () => {
  const base = [{
    id: 'ecology',
    children: [
      { id: 'ecology-01', code: 'E01', name: '冰顶滴水层' },
      { id: 'ecology-02', code: 'E02', name: '冰壁甲壳带' },
    ],
  }];
  const cloud = [
    {
      id: 'official-ecology-01',
      business_code: 'E01',
      category: 'ecology',
      code: 'E10',
      title: '冰顶滴水层',
      visibility: 'public',
      sequence_number: 10,
      index_payload: { title: '冰顶滴水层' },
    },
    {
      id: 'new-ecology-01',
      category: 'ecology',
      code: 'E17',
      title: '后来新增的生态记录',
      visibility: 'public',
      sequence_number: 17,
      index_payload: { title: '后来新增的生态记录' },
    },
  ];

  assert.deepEqual(
    mergePublishedArchiveDirectory(base, cloud)
      .find(({ id }) => id === 'ecology').children.map(({ code }) => code),
    ['E01', 'E02', 'E17'],
  );
});

test('species ecology is one editable reference field and published edits update the ecology link', () => {
  const ecologyField = getArchiveCategoryProfile('species').indexFields
    .find((field) => field.key === 'ecologyCode');
  assert.equal(ecologyField.referenceCategory, 'ecology');
  assert.equal(ecologyField.dynamicOptions, true);

  const nativeForm = renderNativeArchiveForm(getNativeFormProfile('species'), {
    indexData: { title: '测试物种', specimenClass: 'FLORA', ecologyCode: 'E04' },
    values: {},
  });
  assert.match(nativeForm, /data-native-reference-category="ecology"/);
  assert.match(nativeForm, /name="index:ecologyCode"/);

  const merged = mergePublishedArchiveDirectory(ARCHIVE_ROOTS, [{
    id: 'official-species-s01',
    business_code: 'S01',
    category: 'species',
    title: '更新后的物种关联',
    visibility: 'public',
    sequence_number: 1,
    index_payload: { title: '更新后的物种关联', specimenClass: 'FLORA', ecologyCode: 'E07' },
  }]);
  const species = merged.find((directory) => directory.id === 'species').children;
  assert.equal(species.find((record) => record.code === 'S01').ecologyCode, 'E07');
});
