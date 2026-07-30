import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildPublishedArchiveModel,
  renderOfficialArchiveBanner,
  renderPublishedContributionLedger,
} from '../src/archive-workflow/publication.js';
import { mergePublishedArchiveDirectory, resolveArchiveDirectory } from '../src/archive-workflow/directory.js';

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
  target_contribution_id: index === 4 ? 'record-1' : null,
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

test('four independent HZ-6 documents remain four tabs while an amendment stays nested', () => {
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
  assert.equal(model.tabs.length, 4);
  assert.deepEqual(model.tabs.map((tab) => tab.id), contributions.slice(0, 4).map(({ id }) => id));
  assert.ok(model.tabs.every((tab) => tab.id !== 'overview'));
  assert.equal(model.amendmentsByTarget.get('record-1').length, 1);
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
  assert.match(markup, /提交者1/);
  assert.match(markup, /档案修改者/);
  assert.match(markup, /修改者甲/);
  assert.match(markup, /data-open-archive-reference="S05"/);
  assert.match(markup, /VER 0\.1 \/ 白幕初垂 \/ 已录入/);
  assert.match(markup, /data-request-amendment="record-1"/);
  assert.match(markup, /data-amendment-for="record-1"/);
});

test('approved editor documents publish through the formal archive renderer', () => {
  const editorContribution = {
    id: 'person-record',
    title: '叶夫根尼',
    kind: 'new',
    status: 'published',
    versions: [{
      id: 'person-version',
      version_label: '0.1',
      approved_at: '2026-07-27T00:00:00Z',
      submitter: { display_name: '魏伊' },
      reviewer: { display_name: '管理员' },
      content: {
        schemaVersion: 2,
        templateCode: '06',
        category: 'person',
        abbreviation: 'PER',
        title: '叶夫根尼',
        values: { hero: '叶夫根尼', identity: '助理见习书记官' },
        sections: [{ id: 'identity', label: '身份资料 / IDENTITY', fields: ['identity'] }],
        fieldLabels: { identity: '职务' },
        references: [],
        media: [],
      },
    }],
  };
  const model = buildPublishedArchiveModel({
    archive: {
      id: 'person-33',
      code: 'P33',
      title: '叶夫根尼',
      category: 'person',
      visibility: 'public',
      sequence_number: 33,
      abbreviation: 'PER',
    },
    contributions: [editorContribution],
  });

  const markup = renderPublishedContributionLedger(model);
  assert.match(markup, /archive-formal-document--person/);
  assert.match(markup, /033\.PER/);
  assert.match(markup, /身份资料 \/ IDENTITY/);
  assert.match(markup, /档案收录者[\s\S]*魏伊/);
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

test('website-authored content is an editable official archive without a fake version or author', () => {
  const markup = renderOfficialArchiveBanner({
    code: 'O05',
    name: '南极公约监管办公室',
  });
  assert.match(markup, /官方档案/);
  assert.match(markup, /data-request-official-amendment/);
  assert.doesNotMatch(markup, /VER 0\.1|档案提交者|录入者/);
  assert.match(main, /palis:open-amendment/);
});

test('official content remains the first tab when approved community records exist', () => {
  const model = buildPublishedArchiveModel({
    archive: { id: 'hz6', code: 'HZ-6', title: 'HZ-6', visibility: 'public', origin: 'official' },
    contributions,
    officialRecord: {
      id: 'official-hz6',
      title: '官方档案',
      markup: '<article>HZ-6 官方正文</article>',
    },
  });
  const markup = renderPublishedContributionLedger(model);
  assert.equal(model.tabs[0].id, 'official-hz6');
  assert.equal(model.tabs[0].label, '官方档案');
  assert.match(markup, /data-contribution-panel="official-hz6"/);
  assert.match(markup, /HZ-6 官方正文/);
});

test('an amendment to an official base names the official source and only the modifier', () => {
  const officialAmendment = {
    ...contributions[4],
    target_contribution_id: null,
  };
  const model = buildPublishedArchiveModel({
    archive: { id: 'hz6', code: 'HZ-6', title: 'HZ-6', visibility: 'public', origin: 'official' },
    contributions: [officialAmendment],
  });
  const markup = renderPublishedContributionLedger(model);
  assert.match(markup, /<dt>原始档案<\/dt><dd>官方档案<\/dd>/);
  assert.match(markup, /<dt>档案修改者<\/dt><dd>修改者甲<\/dd>/);
  assert.doesNotMatch(markup, /<dt>档案提交者<\/dt>/);
});

test('archive Edit menu exposes real amendment, export, print, and close actions', () => {
  assert.match(html, /data-archive-menu-trigger="edit"/);
  assert.match(html, /data-archive-menu-trigger="file"/);
  for (const action of ['amend', 'export', 'print', 'close']) {
    assert.match(html, new RegExp(`data-archive-edit-action="${action}"`));
  }
  assert.match(main, /initializeArchiveFileMenu/);
  assert.match(main, /downloadArchiveDocument/);
});

test('published record choices live in the File menu rather than above the archive body', () => {
  assert.match(main, /data-archive-record-action/);
  const markup = renderPublishedContributionLedger(buildPublishedArchiveModel({
    archive: { id: 'hz6', code: 'HZ-6', title: 'HZ-6', visibility: 'public' },
    contributions,
  }));
  assert.doesNotMatch(markup, /archive-contribution-tabs/);
  assert.doesNotMatch(markup, /archive-contribution-ledger__mast/);
  assert.match(markup, /data-contribution-tab=/);
});

test('a newly accessioned cloud archive can open immediately in the public archive window', () => {
  assert.match(main, /palis:open-published-archive/);
  assert.match(main, /cloudRecord/);
  assert.match(main, /openCloudArchiveReference/);
  assert.doesNotMatch(main, /if\s*\(!archiveWorkflowClient\s*\|\|\s*!archive\.webContent\)\s*return/);
});

test('published cloud events appear in the event directory without duplicating built-in records', () => {
  const directories = [
    {
      id: 'events',
      code: '07',
      name: '事件',
      meta: '1 FILE',
      children: [{ id: 'event-01', code: 'EV01', name: '已有事件', webContent: true }],
    },
  ];
  const merged = mergePublishedArchiveDirectory(directories, [
    {
      id: 'cloud-event',
      code: 'EV-2026-01',
      title: '新入卷事件',
      category: 'event',
      visibility: 'public',
      published_at: '2026-07-27T12:00:00Z',
      sequence_number: 3,
      abbreviation: 'RLL',
    },
    {
      id: 'existing-event',
      code: 'EV01',
      title: '不应重复的已有事件',
      category: 'event',
      visibility: 'public',
    },
  ]);

  const events = merged.find((directory) => directory.id === 'events');
  assert.equal(events.children.length, 2);
  assert.equal(events.children[1].name, '新入卷事件');
  assert.equal(events.children[1].code, 'EV03');
  assert.equal(events.children[1].webContent, true);
  assert.equal(events.children[1].cloudRecord.id, 'cloud-event');
});

test('an open category resolves to its refreshed cloud-backed directory', () => {
  const originalEvents = { id: 'events', children: [{ code: 'EV01' }] };
  const refreshedEvents = { id: 'events', children: [{ code: 'EV-2026-01' }, { code: 'EV01' }] };

  assert.equal(resolveArchiveDirectory(originalEvents, [refreshedEvents]), refreshedEvents);
});

test('cloud directory sync rebuilds the root index before a category is opened', () => {
  assert.match(main, /listPublishedArchives\(\{\s*limit:\s*pageSize,\s*offset\s*\}\)/);
  assert.match(main, /if\s*\(page\.length\s*<\s*pageSize\)\s*break/);
  assert.match(main, /archiveDirectory = resolveArchiveDirectory\(archiveDirectory, archiveRoots\);\s*buildArchiveOrbit\(archiveDirectory\);/);
  assert.doesNotMatch(main, /if \(currentChapter === 2\) buildArchiveOrbit\(archiveDirectory\);/);
});
