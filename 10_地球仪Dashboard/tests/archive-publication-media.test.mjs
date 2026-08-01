import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPublishedArchiveModel,
  createPublishedMediaSession,
  renderPublishedContributionLedger,
} from '../src/archive-workflow/publication.js';

const editorVersion = (id, category, media = []) => ({
  id: `version-${id}`,
  version_label: '0.1',
  approved_at: '2026-07-29T00:00:00Z',
  submitter: { display_name: '书记官甲' },
  modifier: id.startsWith('amendment') ? { display_name: '书记官乙' } : null,
  reviewer: { display_name: '管理员' },
  content: {
    schemaVersion: 2,
    templateCode: category === 'person' ? '06' : '07',
    category,
    abbreviation: category === 'person' ? 'PER' : 'EVT',
    title: id,
    values: {
      hero: id,
      'amendment:title': id.startsWith('amendment') ? `${id} 补充` : '',
      'amendment:body': id.startsWith('amendment') ? '补充说明' : '',
    },
    sections: [],
    fieldLabels: {},
    references: [],
    media,
  },
});

const contribution = (id, category, {
  kind = 'contribution',
  targetId = null,
  media = [],
} = {}) => ({
  id,
  archive_id: 'archive-media',
  title: id,
  kind,
  target_contribution_id: targetId,
  status: 'published',
  versions: [editorVersion(id, category, media)],
});

const archive = {
  id: 'archive-media',
  code: 'A01',
  title: '媒体测试档案',
  category: 'event',
  sequence_number: 1,
  abbreviation: 'EVT',
  visibility: 'public',
};

test('formal independent documents keep one mount while amendments move into version history', () => {
  const model = buildPublishedArchiveModel({
    archive,
    contributions: [
      contribution('record-1', 'event'),
      contribution('amendment-1', 'event', {
        kind: 'amendment',
        targetId: 'record-1',
      }),
    ],
  });

  const markup = renderPublishedContributionLedger(model);

  assert.match(markup, /data-published-media-mount="record-1"/);
  assert.doesNotMatch(markup, /data-published-media-mount="amendment-1"/);
  assert.match(markup, /data-open-amendment-history="amendment-1"/);
});

test('media session loads only the selected document tree and caches concurrent tab requests', async () => {
  const original = [
    contribution('record-1', 'person', {
      media: [{
        attachmentId: 'portrait-1',
        field: 'photo',
        role: 'portrait',
        storagePath: 'private/portrait-1.webp',
      }],
    }),
    contribution('record-2', 'event'),
    contribution('amendment-1', 'person', {
      kind: 'amendment',
      targetId: 'record-1',
    }),
  ];
  const model = buildPublishedArchiveModel({ archive, contributions: original });
  const requested = [];
  const mounted = new Map();
  const mediaByContribution = {
    'record-1': [{
      id: 'portrait-1',
      role: 'portrait',
      storagePath: 'private/portrait-1.webp',
      publicUrl: 'blob:portrait-1',
      altText: '人物肖像',
      sortOrder: 0,
    }],
    'amendment-1': [{
      id: 'amendment-photo-1',
      role: 'portrait',
      storagePath: 'private/amendment-photo-1.webp',
      publicUrl: 'blob:amendment-photo-1',
      sortOrder: 0,
    }],
    'record-2': [{
      id: 'event-cover-1',
      role: 'event-cover',
      storagePath: 'private/event-cover-1.webp',
      publicUrl: 'https://signed.example/event-cover-1',
      sortOrder: 0,
    }],
  };
  const session = createPublishedMediaSession({
    model,
    listPublishedMedia: async (contributionId) => {
      requested.push(contributionId);
      await Promise.resolve();
      return mediaByContribution[contributionId] || [];
    },
    mount: (contributionId, markup) => mounted.set(contributionId, markup),
  });

  assert.deepEqual(requested, []);

  await session.selectTab('record-1');

  assert.deepEqual(requested.sort(), ['amendment-1', 'record-1']);
  assert.doesNotMatch(JSON.stringify(original), /blob:portrait-1/);
  assert.equal(
    model.contributions[0].latestVersion.content.media[0].publicUrl,
    'blob:portrait-1',
  );
  assert.match(mounted.get('record-1'), /blob:portrait-1/);
  assert.match(mounted.get('amendment-1'), /blob:amendment-photo-1/);

  await Promise.all([
    session.selectTab('record-2'),
    session.selectTab('record-2'),
  ]);

  assert.equal(requested.filter((id) => id === 'record-2').length, 1);
  assert.match(mounted.get('record-2'), /https:\/\/signed\.example\/event-cover-1/);
});

test('media hydration keeps citation tokens from the current amendment version', async () => {
  const reference = { archiveId: 'archive-reference', code: 'O01', label: '原始档案' };
  const model = buildPublishedArchiveModel({
    archive,
    contributions: [
      {
        id: 'record-1',
        archive_id: archive.id,
        title: 'record-1',
        kind: 'contribution',
        target_contribution_id: null,
        status: 'published',
        versions: [{
          ...editorVersion('record-1', 'event'),
          content: {
            ...editorVersion('record-1', 'event').content,
            values: { body: '原始正文' },
            sections: [{ id: 'body', label: '正文', fields: ['body'] }],
            references: [],
          },
        }],
      },
      {
        id: 'amendment-1',
        archive_id: archive.id,
        title: 'amendment-1',
        kind: 'amendment',
        target_contribution_id: 'record-1',
        status: 'published',
        versions: [{
          ...editorVersion('amendment-1', 'event'),
          content: {
            ...editorVersion('amendment-1', 'event').content,
            values: { body: '修订正文〔O01 原始档案〕' },
            sections: [{ id: 'body', label: '正文', fields: ['body'] }],
            references: [reference],
          },
        }],
      },
    ],
  });
  const mounted = new Map();
  const session = createPublishedMediaSession({
    model,
    listPublishedMedia: async () => [],
    mount: (contributionId, markup) => mounted.set(contributionId, markup),
  });

  await session.selectTab('record-1');

  assert.match(mounted.get('record-1'), /data-open-archive-reference="O01"/);
});

test('media session revokes only transient Blob URLs when its archive window closes', async () => {
  const model = buildPublishedArchiveModel({
    archive,
    contributions: [contribution('record-1', 'person')],
  });
  const revoked = [];
  const session = createPublishedMediaSession({
    model,
    listPublishedMedia: async () => [
      { id: 'local', role: 'portrait', publicUrl: 'blob:local-media' },
      { id: 'remote', role: 'portrait', publicUrl: 'https://signed.example/remote-media' },
    ],
    mount: () => {},
    revokeObjectURL: (url) => revoked.push(url),
  });

  await session.selectTab('record-1');
  session.dispose();
  session.dispose();

  assert.deepEqual(revoked, ['blob:local-media']);
});
