import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatArchiveCategoryCode,
  formatArchiveFormalNumber,
  getArchiveCategoryProfile,
  nextArchiveSequence,
  stampArchiveSystemFields,
} from '../src/archive-workflow/category-profiles.js';

test('the nine category profiles allocate after the static archive floors', () => {
  const expected = {
    country: ['N19', '019.REG'],
    organization: ['O25', '025.CHN'],
    station: ['ST21', '021.LOG'],
    entrance: ['EN19', '019.CRD'],
    ecology: ['E08', '008.ECO'],
    person: ['P47', '047.PER'],
    event: ['EV02', '002.RLL'],
    anomaly: ['A04', '004.TRC'],
    species: ['S23', '023.SPC'],
  };

  for (const [category, [categoryCode, formalNumber]] of Object.entries(expected)) {
    const sequenceNumber = nextArchiveSequence(category, 0);
    assert.equal(formatArchiveCategoryCode(category, sequenceNumber), categoryCode);
    assert.equal(formatArchiveFormalNumber(category, sequenceNumber), formalNumber);
  }
});

test('a stored counter above the static floor remains authoritative', () => {
  assert.equal(nextArchiveSequence('event', 41), 42);
  assert.equal(formatArchiveCategoryCode('event', 42), 'EV42');
  assert.equal(formatArchiveFormalNumber('event', 42), '042.RLL');
  assert.equal(getArchiveCategoryProfile('event').templateCode, '07');
});

test('system stamping writes formal identity fields without mutating the draft', () => {
  const draft = {
    schemaVersion: 2,
    templateCode: '09',
    category: 'species',
    abbreviation: 'SPC',
    title: '白玉兰',
    businessCode: '书记官手填值',
    values: {
      hero: '白玉兰',
      dossierNo: '手填档号',
      entryCode: '手填编号',
      regDate: '手填日期',
      clerk: '冒名署名',
      customField: '保留',
    },
    sections: [],
    fieldLabels: {},
    references: [],
    media: [],
  };
  const before = structuredClone(draft);

  const stamped = stampArchiveSystemFields(draft, {
    category: 'species',
    sequenceNumber: 23,
    registeredAt: '2026-07-29T15:16:17.000Z',
    clerkName: '书记官：主行',
  });

  assert.deepEqual(draft, before);
  assert.equal(stamped.businessCode, 'S23');
  assert.deepEqual(
    {
      dossierNo: stamped.values.dossierNo,
      entryCode: stamped.values.entryCode,
      regDate: stamped.values.regDate,
      clerk: stamped.values.clerk,
      customField: stamped.values.customField,
    },
    {
      dossierNo: '023.SPC',
      entryCode: 'S23',
      regDate: '2026-07-29',
      clerk: '书记官：主行',
      customField: '保留',
    },
  );
});
