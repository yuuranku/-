import assert from 'node:assert/strict';
import test from 'node:test';

import { buildArchiveRecordTree } from '../src/archive-workflow/record-tree.js';
import {
  buildPublishedArchiveModel,
  renderPublishedContributionLedger,
} from '../src/archive-workflow/publication.js';

const version = (id, approvedAt = '2026-07-29T00:00:00Z') => ({
  id: `version-${id}`,
  version_label: '0.1',
  approved_at: approvedAt,
  modifier: id === 'amendment-1' ? { display_name: '书记官乙' } : null,
  reviewer: { display_name: '管理员' },
  content: {
    schemaVersion: 2,
    templateCode: '09',
    category: 'species',
    abbreviation: 'SPC',
    title: id,
    values: {
      hero: id,
      'amendment:title': id === 'amendment-1' ? '宗教栏补录' : '',
      'amendment:body': id === 'amendment-1' ? '对记录 01 的补充修改。' : '',
    },
    sections: [],
    fieldLabels: {},
    references: [],
    media: [],
  },
});

const records = Array.from({ length: 4 }, (_, index) => ({
  id: `record-${index + 1}`,
  archive_id: 'species-23',
  title: `记录 ${index + 1}`,
  kind: index === 0 ? 'new' : 'contribution',
  status: 'published',
  versions: [version(`record-${index + 1}`)],
}));

const amendment = {
  id: 'amendment-1',
  archive_id: 'species-23',
  title: '记录一修订',
  kind: 'amendment',
  target_contribution_id: 'record-1',
  status: 'published',
  versions: [version('amendment-1', '2026-07-30T00:00:00Z')],
};

test('record tree counts independent documents and nests targeted amendments', () => {
  const model = buildArchiveRecordTree({
    officialRecord: null,
    contributions: [...records, amendment],
  });

  assert.equal(model.records.length, 4);
  assert.equal(model.tabs.length, 4);
  assert.deepEqual(model.tabs.map(({ id }) => id), records.map(({ id }) => id));
  assert.equal(model.amendmentsByTarget.get('record-1').length, 1);
  assert.equal(model.amendmentsByTarget.get('record-1')[0].id, 'amendment-1');
});

test('published ledger renders an amendment inside its target without creating a tab', () => {
  const model = buildPublishedArchiveModel({
    archive: {
      id: 'species-23',
      code: 'S23',
      title: '白壳物种',
      category: 'species',
      sequence_number: 23,
      abbreviation: 'SPC',
      visibility: 'public',
    },
    contributions: [...records, amendment],
  });
  const rendered = renderPublishedContributionLedger(model);

  assert.equal(model.contributions.length, 4);
  assert.doesNotMatch(rendered, /data-contribution-tab="amendment-1"/);
  assert.match(rendered, /data-amendment-for="record-1"/);
  assert.match(rendered, /宗教栏补录/);
  assert.match(rendered, /书记官乙/);
});
