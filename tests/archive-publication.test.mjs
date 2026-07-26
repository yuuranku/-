import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildPublishedArchiveModel,
  renderPublishedContributionLedger,
} from '../src/archive-workflow/publication.js';

const projectRoot = new URL('../', import.meta.url);
const [main, html, styles] = await Promise.all([
  readFile(new URL('src/main.js', projectRoot), 'utf8'),
  readFile(new URL('index.html', projectRoot), 'utf8'),
  readFile(new URL('src/style.css', projectRoot), 'utf8'),
]);

const contributions = Array.from({ length: 5 }, (_, index) => ({
  id: `record-${index + 1}`,
  title: `HZ-6 记录 ${index + 1}`,
  kind: index === 4 ? 'amendment' : 'contribution',
  status: 'published',
  versions: [{
    id: `version-${index + 1}`,
    version_label: '0.1',
    approved_at: `2026-07-${20 + index}T00:00:00Z`,
    submitter: { display_name: `提交者${index + 1}` },
    modifier: index === 4 ? { display_name: '修改者甲' } : null,
    reviewer: { display_name: '管理员' },
    content: {
      fields: { 事件经过: `第 ${index + 1} 份通过记录` },
      references: [{ type: 'archive-reference', archiveId: 'species-1', code: 'S05', label: '长枝兽' }],
    },
  }],
}));

test('five approved HZ-6 records become exactly five switchable records', () => {
  const model = buildPublishedArchiveModel({
    archive: {
      id: 'hz6',
      code: 'HZ-6',
      title: 'HZ-6 样本线任务',
      visibility: 'public',
      is_mother: true,
      is_archived: true,
    },
    contributions,
  });
  assert.equal(model.tabs.length, 5);
  assert.deepEqual(model.tabs.map((tab) => tab.id), contributions.map(({ id }) => id));
  assert.ok(model.tabs.every((tab) => tab.id !== 'overview'));
  assert.deepEqual(model.marks, ['mother', 'archival']);
});

test('published contribution ledger shows attribution, history, references and registration stamp', () => {
  const model = buildPublishedArchiveModel({
    archive: { id: 'hz6', code: 'HZ-6', title: 'HZ-6', visibility: 'public' },
    contributions,
  });
  const markup = renderPublishedContributionLedger(model);
  assert.doesNotMatch(markup, /data-contribution-panel="overview"/);
  assert.match(markup, /档案提交者/);
  assert.match(markup, /提交者5/);
  assert.match(markup, /档案修改者/);
  assert.match(markup, /修改者甲/);
  assert.match(markup, /data-open-archive-reference="S05"/);
  assert.match(markup, /VER 0\.1 \/ 白幕初垂 \/ 已录入/);
  assert.match(markup, /data-request-amendment="record-5"/);
});

test('sealed and offline archives never produce a public contribution model', () => {
  for (const visibility of ['sealed', 'offline']) {
    assert.equal(buildPublishedArchiveModel({
      archive: { id: 'hz6', code: 'HZ-6', title: 'HZ-6', visibility },
      contributions,
    }), null);
  }
});

test('site and update announcement use the same clickable archive reference action', () => {
  assert.match(main, /function openArchiveReference/);
  assert.match(main, /data-open-archive-reference/);
  assert.match(main, /listArchiveContributions/);
  assert.match(html, /data-version-reference/);
  assert.match(styles, /archive-contribution-tabs/);
  assert.match(styles, /archive-registration-stamp/);
});
