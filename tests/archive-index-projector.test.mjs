import assert from 'node:assert/strict';
import test from 'node:test';

import { mergePublishedArchiveDirectory } from '../src/archive-workflow/directory.js';
import { projectPublishedArchive } from '../src/archive-workflow/index-projector.js';

const identityCases = [
  ['country', 19, 'N19', '019.REG'],
  ['organization', 25, 'O25', '025.CHN'],
  ['station', 21, 'ST21', '021.LOG'],
  ['entrance', 19, 'EN19', '019.CRD'],
  ['ecology', 8, 'E08', '008.ECO'],
  ['person', 47, 'P47', '047.PER'],
  ['event', 27, 'EV27', '027.RLL'],
  ['anomaly', 26, 'A26', '026.TRC'],
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
