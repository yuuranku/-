import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createArchiveMediaUploadSession,
  createReviewMediaLoader,
  persistableWorkspaceMedia,
  renderArchiveMediaEditor,
  submitDraftWithArchiveMedia,
} from '../src/archive-workflow/workspace.js';

const imageFile = (name, {
  size = 2048,
  type = 'image/png',
  lastModified = 17,
} = {}) => ({
  name,
  size,
  type,
  lastModified,
});

test('workspace renders bounded media slots for every archive type with image support', () => {
  const person = renderArchiveMediaEditor('person');
  assert.match(person, /data-archive-media-role="portrait"/);
  assert.doesNotMatch(person, /event-cover|event-evidence|multiple/);

  const event = renderArchiveMediaEditor('event');
  assert.match(event, /data-archive-media-role="event-cover"/);
  assert.match(event, /data-archive-media-role="event-evidence"/);
  assert.match(event, /data-archive-media-input="event-evidence"[^>]*multiple/);
  assert.match(event, /最多 6 张/);

  const anomaly = renderArchiveMediaEditor('anomaly');
  assert.match(anomaly, /data-archive-media-role="anomaly-cover"/);
  assert.match(anomaly, /data-archive-media-role="anomaly-image"/);
  assert.match(anomaly, /data-archive-media-input="anomaly-image"[^>]*multiple/);

  const species = renderArchiveMediaEditor('species');
  assert.match(species, /data-archive-media-role="species-cover"/);
  assert.match(species, /data-archive-media-role="species-image"/);
  assert.match(species, /data-archive-media-input="species-image"[^>]*multiple/);

  for (const [category, role] of [
    ['country', 'country-flag'],
    ['organization', 'organization-cover'],
    ['station', 'station-cover'],
    ['entrance', 'entrance-cover'],
    ['ecology', 'ecology-cover'],
  ]) {
    assert.match(renderArchiveMediaEditor(category), new RegExp(`data-archive-media-role="${role}"`));
  }

  for (const category of ['item', 'document']) {
    assert.equal(renderArchiveMediaEditor(category), '');
  }
});

test('all archive autosaves keep only durable media descriptors', () => {
  const mixed = [{
    attachmentId: 'attachment-1',
    storagePath: 'clerk/draft/portrait.webp',
    role: 'portrait',
    field: 'photo',
    publicUrl: 'https://signed.example/portrait',
    dataUrl: 'data:image/png;base64,AAAA',
    file: imageFile('portrait.png'),
    altText: '人物正面肖像',
    caption: '调查期肖像',
    sortOrder: 0,
  }, {
    role: 'portrait',
    field: 'photo',
    dataUrl: 'data:image/png;base64,BBBB',
  }];

  assert.deepEqual(persistableWorkspaceMedia('person', mixed), [{
    attachmentId: 'attachment-1',
    field: 'photo',
    role: 'portrait',
    storagePath: 'clerk/draft/portrait.webp',
    altText: '人物正面肖像',
    caption: '调查期肖像',
    sortOrder: 0,
  }]);
  assert.deepEqual(
    persistableWorkspaceMedia('species', mixed),
    persistableWorkspaceMedia('person', mixed),
  );
});

test('media upload session optimizes and uploads slots serially with complete metadata', async () => {
  const events = [];
  let activeUploads = 0;
  const session = createArchiveMediaUploadSession({
    category: 'event',
    optimize: async (file, policy) => {
      events.push(`optimize:${file.name}:${policy.maxBytes}`);
      return { ...file, name: file.name.replace(/\.[^.]+$/, '.webp'), type: 'image/webp' };
    },
    uploadAttachment: async (draftId, ownerId, file, metadata) => {
      activeUploads += 1;
      assert.equal(activeUploads, 1);
      events.push(`upload:${metadata.role}:${metadata.sortOrder}:${file.name}`);
      await Promise.resolve();
      activeUploads -= 1;
      return {
        id: `attachment-${metadata.role}-${metadata.sortOrder}`,
        storage_path: `${ownerId}/${draftId}/${file.name}`,
      };
    },
  });

  const media = await session.upload({
    draftId: 'draft-1',
    ownerId: 'clerk-1',
    existingMedia: [],
    selections: {
      'event-cover': [{
        file: imageFile('cover.png'),
        altText: '事故现场远景',
        caption: '主封面',
      }],
      'event-evidence': [{
        file: imageFile('evidence-a.png'),
        altText: '折断的测量杆',
        caption: '证据 A',
      }, {
        file: imageFile('evidence-b.png'),
        altText: '雪面足迹',
        caption: '证据 B',
      }],
    },
  });

  assert.deepEqual(events, [
    'optimize:cover.png:819200',
    'upload:event-cover:0:cover.webp',
    'optimize:evidence-a.png:819200',
    'upload:event-evidence:0:evidence-a.webp',
    'optimize:evidence-b.png:819200',
    'upload:event-evidence:1:evidence-b.webp',
  ]);
  assert.deepEqual(media.map((entry) => ({
    attachmentId: entry.attachmentId,
    field: entry.field,
    role: entry.role,
    altText: entry.altText,
    caption: entry.caption,
    sortOrder: entry.sortOrder,
  })), [{
    attachmentId: 'attachment-event-cover-0',
    field: 'photo',
    role: 'event-cover',
    altText: '事故现场远景',
    caption: '主封面',
    sortOrder: 0,
  }, {
    attachmentId: 'attachment-event-evidence-0',
    field: 'evidence',
    role: 'event-evidence',
    altText: '折断的测量杆',
    caption: '证据 A',
    sortOrder: 0,
  }, {
    attachmentId: 'attachment-event-evidence-1',
    field: 'evidence',
    role: 'event-evidence',
    altText: '雪面足迹',
    caption: '证据 B',
    sortOrder: 1,
  }]);
});

test('media upload session rejects an overfilled role before uploading any file', async () => {
  let uploadCount = 0;
  const session = createArchiveMediaUploadSession({
    category: 'event',
    optimize: async (file) => file,
    uploadAttachment: async () => {
      uploadCount += 1;
      return { id: `unexpected-${uploadCount}`, storage_path: `unexpected-${uploadCount}` };
    },
  });
  const existingMedia = Array.from({ length: 5 }, (_, index) => ({
    attachmentId: `existing-${index}`,
    storagePath: `clerk/draft/existing-${index}.webp`,
    field: 'evidence',
    role: 'event-evidence',
    sortOrder: index,
  }));

  await assert.rejects(
    session.upload({
      draftId: 'draft-1',
      ownerId: 'clerk-1',
      existingMedia,
      selections: {
        'event-evidence': [
          { file: imageFile('sixth.png') },
          { file: imageFile('seventh.png') },
        ],
      },
    }),
    (error) => error?.code === 'media_slot_full',
  );
  assert.equal(uploadCount, 0);
});

test('submission saves text before media, saves durable media again, then submits', async () => {
  const events = [];
  let syncCount = 0;
  let durableMedia = [];

  const result = await submitDraftWithArchiveMedia({
    syncDraft: async () => {
      syncCount += 1;
      events.push(`sync:${syncCount}:${durableMedia.length}`);
      return { id: 'draft-1', status: 'draft' };
    },
    getDraftId: () => 'draft-1',
    uploadMedia: async (draftId) => {
      events.push(`media:${draftId}`);
      return [{
        attachmentId: 'attachment-1',
        storagePath: 'clerk/draft/portrait.webp',
        field: 'photo',
        role: 'portrait',
        altText: '人物肖像',
        caption: '',
        sortOrder: 0,
      }];
    },
    persistMedia: (media) => {
      durableMedia = media;
      events.push(`persist:${media[0].attachmentId}`);
    },
    uploadAttachments: async (draftId) => {
      events.push(`attachments:${draftId}`);
    },
    submitDraft: async (draftId) => {
      events.push(`submit:${draftId}`);
      return { id: draftId, status: 'submitted' };
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(events, [
    'sync:1:0',
    'media:draft-1',
    'persist:attachment-1',
    'attachments:draft-1',
    'sync:2:1',
    'submit:draft-1',
  ]);
});

test('failed media upload never submits and a retry does not upload a successful slot twice', async () => {
  let uploadCount = 0;
  let submitCount = 0;
  let failSubmit = true;
  let durableMedia = [];
  const selection = {
    portrait: [{
      file: imageFile('portrait.png'),
      altText: '人物肖像',
      caption: '',
    }],
  };
  const session = createArchiveMediaUploadSession({
    category: 'person',
    optimize: async (file) => ({ ...file, name: 'portrait.webp', type: 'image/webp' }),
    uploadAttachment: async () => {
      uploadCount += 1;
      return {
        id: 'portrait-attachment',
        storage_path: 'clerk/draft/portrait.webp',
      };
    },
  });

  const run = () => submitDraftWithArchiveMedia({
    syncDraft: async () => ({ id: 'draft-1', status: 'draft' }),
    getDraftId: () => 'draft-1',
    uploadMedia: () => session.upload({
      draftId: 'draft-1',
      ownerId: 'clerk-1',
      existingMedia: durableMedia,
      selections: selection,
    }),
    persistMedia: (media) => {
      durableMedia = media;
    },
    submitDraft: async () => {
      submitCount += 1;
      if (failSubmit) throw new Error('temporary submit failure');
      return { id: 'draft-1', status: 'submitted' };
    },
  });

  await assert.rejects(run(), /temporary submit failure/);
  assert.equal(uploadCount, 1);
  assert.equal(submitCount, 1);

  failSubmit = false;
  const retried = await run();
  assert.equal(retried.ok, true);
  assert.equal(uploadCount, 1);
  assert.equal(submitCount, 2);

  const failedBeforeSubmit = await submitDraftWithArchiveMedia({
    syncDraft: async () => ({ id: 'draft-2', status: 'draft' }),
    getDraftId: () => 'draft-2',
    uploadMedia: async () => {
      throw new Error('upload interrupted');
    },
    persistMedia: () => assert.fail('failed upload must not persist a completed set'),
    submitDraft: async () => {
      submitCount += 1;
    },
  }).catch((error) => error);
  assert.equal(failedBeforeSubmit.message, 'upload interrupted');
  assert.equal(submitCount, 2);
});

test('submission stops before media or submit when either cloud save fails', async () => {
  let mediaCalls = 0;
  let submitCalls = 0;
  const initialFailure = await submitDraftWithArchiveMedia({
    syncDraft: async () => ({ status: 'network-error' }),
    getDraftId: () => null,
    uploadMedia: async () => {
      mediaCalls += 1;
      return [];
    },
    persistMedia: () => {},
    submitDraft: async () => {
      submitCalls += 1;
    },
  });
  assert.deepEqual(initialFailure, {
    ok: false,
    stage: 'initial-sync',
    syncResult: { status: 'network-error' },
  });

  let syncCount = 0;
  const mediaSaveFailure = await submitDraftWithArchiveMedia({
    syncDraft: async () => {
      syncCount += 1;
      return syncCount === 1
        ? { id: 'draft-1', status: 'draft' }
        : { status: 'conflict', conflict: true };
    },
    getDraftId: () => 'draft-1',
    uploadMedia: async () => {
      mediaCalls += 1;
      return [];
    },
    persistMedia: () => {},
    submitDraft: async () => {
      submitCalls += 1;
    },
  });
  assert.equal(mediaSaveFailure.ok, false);
  assert.equal(mediaSaveFailure.stage, 'media-sync');
  assert.equal(mediaCalls, 1);
  assert.equal(submitCalls, 0);
});

test('review media loader hydrates the latest selection and ignores late stale requests', async () => {
  const pending = new Map();
  const loader = createReviewMediaLoader({
    loadMedia: (contributionId) => new Promise((resolve, reject) => {
      pending.set(contributionId, { resolve, reject });
    }),
  });
  const firstSubmission = {
    id: 'submission-1',
    draft_content: { schemaVersion: 2, media: [] },
  };
  const secondSubmission = {
    id: 'submission-2',
    draft_content: { schemaVersion: 2, media: [] },
  };

  const first = loader.select(firstSubmission);
  const second = loader.select(secondSubmission);
  pending.get('submission-2').resolve([{
    id: 'media-2',
    role: 'event-cover',
    storagePath: 'clerk/submission-2/cover.webp',
    publicUrl: 'blob:submission-2-cover',
    altText: '第二事件现场',
    caption: '',
    sortOrder: 0,
  }]);
  const secondResult = await second;
  assert.equal(secondResult.stale, false);
  assert.equal(secondResult.submission.draft_content.media[0].attachmentId, 'media-2');

  pending.get('submission-1').resolve([{
    id: 'media-1',
    role: 'portrait',
    storagePath: 'clerk/submission-1/portrait.webp',
    publicUrl: 'blob:submission-1-portrait',
    altText: '第一人物肖像',
    caption: '',
    sortOrder: 0,
  }]);
  assert.equal((await first).stale, true);

  const failedLoader = createReviewMediaLoader({
    loadMedia: async () => {
      throw new Error('media service unavailable');
    },
  });
  const failed = await failedLoader.select(firstSubmission);
  assert.equal(failed.stale, false);
  assert.strictEqual(failed.submission, firstSubmission);
  assert.equal(failed.error.message, 'media service unavailable');
});

test('review media loader revokes stale and replaced Blob URLs but never remote signed URLs', async () => {
  const revoked = [];
  const mediaBySubmission = {
    first: [{
      id: 'first-local',
      role: 'portrait',
      storagePath: 'first.webp',
      publicUrl: 'blob:first',
      altText: '第一张',
      caption: '',
      sortOrder: 0,
    }, {
      id: 'first-remote',
      role: 'portrait',
      storagePath: 'remote.webp',
      publicUrl: 'https://signed.example/first',
      altText: '远端图',
      caption: '',
      sortOrder: 1,
    }],
    second: [{
      id: 'second-local',
      role: 'event-cover',
      storagePath: 'second.webp',
      publicUrl: 'blob:second',
      altText: '第二张',
      caption: '',
      sortOrder: 0,
    }],
  };
  const loader = createReviewMediaLoader({
    loadMedia: async (id) => mediaBySubmission[id],
    revokeObjectURL: (url) => revoked.push(url),
  });
  const submission = (id) => ({
    id,
    draft_content: { schemaVersion: 2, media: [] },
  });

  await loader.select(submission('first'));
  await loader.select(submission('second'));
  assert.deepEqual(revoked, ['blob:first']);

  loader.dispose();
  assert.deepEqual(revoked, ['blob:first', 'blob:second']);
  assert.doesNotMatch(revoked.join(','), /https:/);
});
