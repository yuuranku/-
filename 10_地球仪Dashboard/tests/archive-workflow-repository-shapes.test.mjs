import test from 'node:test';
import assert from 'node:assert/strict';

import { ARCHIVE_ROOTS } from '../src/archive-data.js';
import { readNativeFormState } from '../src/archive-workflow/native-form-profiles.js';
import { assertArchiveWorkflowResult } from '../src/archive-workflow/repository-contract.js';
import { ARCHIVE_TEMPLATE_BY_CODE } from '../src/archive-workflow/templates.js';

const without = (record, field) => {
  const copy = { ...record };
  delete copy[field];
  return copy;
};

const profile = {
  id: 'operator-1',
  email: 'clerk@example.com',
  display_name: 'Archive Clerk',
  role: 'clerk',
  enabled: true,
};

const draft = {
  id: 'contribution-1',
  archive_id: 'archive-1',
  template_id: 'template-1',
  owner_id: 'operator-1',
  title: 'HZ-6 incident record',
  kind: 'contribution',
  status: 'draft',
  draft_content: { schemaVersion: 2, sections: [] },
  revision: 1,
  updated_at: '2026-07-28T00:00:00.000Z',
};

const archive = {
  id: 'archive-1',
  code: 'HZ-6',
  category: 'events',
  title: 'HZ-6 incident record',
  visibility: 'public',
  sequence_number: 6,
  abbreviation: 'HZ',
};

const version = {
  id: 'version-1',
  version_label: '0.1',
  content: { schemaVersion: 2, sections: [] },
  approved_at: '2026-07-28T00:00:00.000Z',
  created_at: '2026-07-28T00:00:00.000Z',
  submitter: profile,
  modifier: null,
  reviewer: profile,
};

const workspaceNote = {
  id: 'note-1',
  title: '值班提醒',
  content: '今日交接前核对索引。',
  sort_order: 3,
  created_by: 'admin-1',
  created_at: '2026-07-29T00:00:00.000Z',
  updated_at: '2026-07-29T00:05:00.000Z',
};

const workspaceNoteLayout = {
  note_id: workspaceNote.id,
  profile_id: profile.id,
  left_px: 120,
  top_px: 80,
  updated_at: '2026-07-29T00:06:00.000Z',
};

const archiveStoryPage = {
  id: 'story-page-1',
  archive_id: archive.id,
  author_id: profile.id,
  author_name: profile.display_name,
  title: '夜间观察',
  body: '采样者在冰窗边缘记录到新的反应。',
  created_at: '2026-08-05T00:00:00.000Z',
  updated_at: '2026-08-05T00:00:00.000Z',
  archive: { id: archive.id, code: archive.code, title: archive.title, visibility: archive.visibility },
};

test('result contract accepts the reduced relation shapes returned by Supabase joins and public RPCs', () => {
  const publicPerson = { id: 'operator-1', display_name: 'Archive Clerk' };
  const publicVersion = {
    id: 'version-1',
    version_label: '0.1',
    content: { schemaVersion: 2, sections: [] },
    approved_at: '2026-07-28T00:00:00.000Z',
    created_at: '2026-07-28T00:00:00.000Z',
    submitter: publicPerson,
    modifier: null,
    reviewer: null,
  };
  const publicContribution = {
    id: 'contribution-1',
    archive_id: 'archive-1',
    target_contribution_id: null,
    title: 'HZ-6 incident record',
    kind: 'contribution',
    status: 'published',
    created_at: '2026-07-28T00:00:00.000Z',
    owner: publicPerson,
    versions: [publicVersion],
  };

  assert.doesNotThrow(() => assertArchiveWorkflowResult('listReviewQueue', [{
    ...draft,
    owner: { id: profile.id, email: profile.email, display_name: profile.display_name },
    archive,
  }]));
  assert.doesNotThrow(() => assertArchiveWorkflowResult('listArchiveContributions', [publicContribution]));
  assert.doesNotThrow(() => assertArchiveWorkflowResult('listArchiveReferences', [{
    id: 'reference-1',
    source_archive: { id: archive.id, code: archive.code, title: archive.title, visibility: archive.visibility },
  }]));
});

test('result contract accepts the minimum UI-facing return shapes', () => {
  const cases = [
    ['getProfile', profile],
    ['listTemplates', [{ id: 'template-1', code: 'event', category: 'events', title: 'Event', schema: {}, active: true }]],
    ['listMyDrafts', [draft]],
    ['saveDraft', draft],
    ['saveDraft', { status: 'conflict', conflict: true, cloud: draft }],
    ['submitDraft', draft],
    ['listReviewQueue', [{ ...draft, owner: profile, archive }]],
    ['reviewSubmission', { ...draft, status: 'approved' }],
    ['publishContribution', {
      archiveId: 'archive-1',
      versionId: 'version-1',
      status: 'published',
      code: 'EV27',
      sequenceNumber: 27,
      abbreviation: 'RLL',
      formalNumber: '027.RLL',
      versionLabel: '0.1',
    }],
    ['listUsers', [profile]],
    ['sendAnnouncement', { id: 'notification-2', subject: 'Station notice', created_at: '2026-07-28T00:00:00.000Z', message: 'Use the B duty roster.', kind: 'announcement', read_at: null, sender_label: 'PALIS 档案管理处' }],
    ['listNotifications', [{ id: 'notification-1', subject: 'Draft reviewed', created_at: '2026-07-28T00:00:00.000Z', message: 'Please revise', kind: 'changes_requested', read_at: null, contribution: { title: draft.title } }]],
    ['markNotificationRead', { id: 'notification-1', read_at: '2026-07-28T00:00:00.000Z' }],
    ['searchArchives', [archive]],
    ['searchArchiveStoryPages', [archiveStoryPage]],
    ['listPublishedArchives', [archive]],
    ['listEditableArchives', [archive]],
    ['listAdminArchives', [archive]],
    ['deleteArchive', { id: archive.id, code: archive.code, title: archive.title }],
    ['loadArchiveEditorSource', { archiveId: archive.id, contributionId: draft.id, versionId: version.id, content: version.content }],
    ['loadArchiveEditorSource', null],
    ['listArchiveContributions', [{ id: draft.id, archive_id: draft.archive_id, target_contribution_id: null, title: draft.title, kind: draft.kind, status: 'published', created_at: draft.updated_at, owner: { id: profile.id, display_name: profile.display_name }, versions: [version] }]],
    ['listArchiveDocuments', [{
      id: draft.id,
      title: draft.title,
      kind: 'contribution',
      latestVersionId: version.id,
      versionLabel: version.version_label,
      ownerName: profile.display_name,
    }]],
    ['listArchiveReferences', [{ id: 'reference-1', source_archive: archive }]],
    ['listContributionMedia', [{
      id: 'attachment-1',
      role: 'event-cover',
      storagePath: 'operator-1/contribution-1/cover.webp',
      publicUrl: 'blob:review-cover',
      altText: '待审事件现场',
      caption: '待审现场记录',
      sortOrder: 0,
    }]],
    ['listPublishedMedia', [{
      id: 'attachment-1',
      role: 'event-cover',
      storagePath: 'operator-1/contribution-1/cover.webp',
      publicUrl: 'blob:local-cover',
      altText: '事件现场',
      caption: '现场记录',
      sortOrder: 0,
    }]],
    ['setArchiveNewBadge', { id: archive.id, new_badge_visible: false }],
    ['uploadAttachment', { id: 'attachment-1' }],
    ['listWorkspaceNotes', [workspaceNote]],
    ['createWorkspaceNote', workspaceNote],
    ['updateWorkspaceNote', workspaceNote],
    ['deleteWorkspaceNote', { id: workspaceNote.id }],
    ['listWorkspaceNoteLayouts', [workspaceNoteLayout]],
    ['saveWorkspaceNoteLayout', workspaceNoteLayout],
  ];

  for (const [method, result] of cases) {
    assert.doesNotThrow(() => assertArchiveWorkflowResult(method, result), method);
  }
});

test('workspace note result contract rejects incomplete shared and personal shapes', () => {
  assert.throws(
    () => assertArchiveWorkflowResult('listWorkspaceNotes', [without(workspaceNote, 'created_by')]),
    /created_by/,
  );
  assert.throws(
    () => assertArchiveWorkflowResult('saveWorkspaceNoteLayout', without(workspaceNoteLayout, 'top_px')),
    /top_px/,
  );
  assert.throws(
    () => assertArchiveWorkflowResult('deleteWorkspaceNote', {}),
    /id/,
  );
});

test('editor source result validates every optional hydrated relation when present', () => {
  const editorSource = {
    archiveId: archive.id,
    contributionId: draft.id,
    versionId: version.id,
    sourceKind: 'document',
    content: version.content,
    archive,
    references: [{
      archiveId: 'archive-2',
      code: 'P12',
      label: 'Fresh archive label',
    }],
    mediaContributionId: draft.id,
    version,
  };

  assert.doesNotThrow(() =>
    assertArchiveWorkflowResult('loadArchiveEditorSource', editorSource));
  assert.throws(
    () => assertArchiveWorkflowResult('loadArchiveEditorSource', {
      ...editorSource,
      sourceKind: 'newest-anywhere',
    }),
    /sourceKind/,
  );
  assert.throws(
    () => assertArchiveWorkflowResult('loadArchiveEditorSource', {
      ...editorSource,
      references: [{ archiveId: 'archive-2', code: 'P12' }],
    }),
    /references\[0\]\.label/,
  );
  assert.throws(
    () => assertArchiveWorkflowResult('loadArchiveEditorSource', {
      ...editorSource,
      version: without(version, 'content'),
    }),
    /version\.content/,
  );
});

test('official static fallback creates a readable v2 baseline instead of a blank form', async () => {
  let toEditorDocumentFromOfficialArchive;
  try {
    ({ toEditorDocumentFromOfficialArchive } = await import(
      '../src/archive-workflow/official-archive-source.js'
    ));
  } catch (error) {
    assert.fail(`official archive adapter must be implemented: ${error.message}`);
  }
  const staticRoot = ARCHIVE_ROOTS.find(({ code }) => code === '03');
  const officialArchive = {
    id: 'official-station',
    code: 'SU-VOS',
    category: 'station',
    title: '东方科考站',
    visibility: 'public',
    sequence_number: 5,
    abbreviation: 'LOG',
    index_payload: {
      title: 'Stale static title',
      owner: 'PALIS',
      latitude: '-78.46',
    },
  };

  const source = toEditorDocumentFromOfficialArchive(
    officialArchive,
    staticRoot,
    ARCHIVE_TEMPLATE_BY_CODE['03'],
  );

  assert.equal(source.schemaVersion, 2);
  assert.equal(source.indexData.title, officialArchive.title);
  assert.equal(source.indexData.owner, 'PALIS');
  assert.equal(source.values.hero, officialArchive.title);
  assert.match(source.values['legacy:official-body'], /东方站/);
  assert.notEqual(source.values['legacy:official-body'].trim(), '');
});

test('organization amendment drafts prefill fixed fields and custom entries from the existing record', async () => {
  const { toEditorDocumentFromArchiveBase } = await import(
    '../src/archive-workflow/official-archive-source.js'
  );
  const source = toEditorDocumentFromArchiveBase({
    id: 'organization-o02', code: 'O02', category: 'organization', title: '\u5185\u9646\u7279\u522b\u4f5c\u4e1a\u5c40',
  }, null, ARCHIVE_TEMPLATE_BY_CODE['02']);

  assert.equal(source.values.institutionNumber, 'O02');
  assert.equal(source.indexData.channel, 'red');
  assert.notEqual(source.values.organizationNature, '');
  assert.match(source.values.powerStructure, /\u5c40\u957f/);
  assert.equal(source.values['custom:item:section-1:title'], '\u673a\u6784\u5b9a\u4f4d');
  assert.notEqual(source.values['custom:item:section-1:content'], '');
  assert.ok(Object.keys(source.values).filter((key) => key.endsWith(':title')).length >= 2);
});

test('event amendment drafts prefill fixed fields and report entries from the existing record', async () => {
  const { toEditorDocumentFromArchiveBase } = await import(
    '../src/archive-workflow/official-archive-source.js'
  );
  const source = toEditorDocumentFromArchiveBase({
    id: 'event-v04', code: 'V04', category: 'event', title: 'HZ-6 样本线任务',
  }, null, ARCHIVE_TEMPLATE_BY_CODE['07']);

  assert.notEqual(source.values.missionNumber, '');
  assert.notEqual(source.values.missionDate, '');
  assert.notEqual(source.values.missionArea, '');
  assert.notEqual(source.values.missionContent, '');
  assert.notEqual(source.values.archiveStatus, '');
  assert.ok(Object.keys(source.values).some((key) => key.startsWith('custom:item:section-') && key.endsWith(':content')));
});

test('species amendment drafts prefill the original four-field plate and full record text', async () => {
  const { toEditorDocumentFromArchiveBase } = await import(
    '../src/archive-workflow/official-archive-source.js'
  );
  const source = toEditorDocumentFromArchiveBase({
    id: 'species-s01', code: 'S01', category: 'species', title: 'Abyssodendron aciculatum',
  }, null, ARCHIVE_TEMPLATE_BY_CODE['09']);
  const state = readNativeFormState(ARCHIVE_TEMPLATE_BY_CODE['09'], source);

  assert.match(state.body.temporaryTaxonomy, /Eukaryota/);
  assert.match(state.body.scale, /1/);
  assert.notEqual(state.body.primaryLayer, '');
  assert.notEqual(state.body.specimenState, '');
  assert.equal(state.customEntries[0]?.title, '正文记录 01');
  assert.notEqual(state.customEntries[0]?.content, '');
});

test('official static fallback rejects an official archive without a matching static record', async () => {
  let toEditorDocumentFromOfficialArchive;
  try {
    ({ toEditorDocumentFromOfficialArchive } = await import(
      '../src/archive-workflow/official-archive-source.js'
    ));
  } catch (error) {
    assert.fail(`official archive adapter must be implemented: ${error.message}`);
  }
  const staticRoot = ARCHIVE_ROOTS.find(({ code }) => code === '03');

  assert.throws(
    () => toEditorDocumentFromOfficialArchive({
      id: 'missing-static-station',
      code: 'ST-NOT-FOUND',
      category: 'station',
      title: 'Missing station',
      index_payload: {},
    }, staticRoot, ARCHIVE_TEMPLATE_BY_CODE['03']),
    /No static official archive record.*ST-NOT-FOUND/i,
  );
});

test('result contract rejects incomplete publication and media identities', () => {
  assert.throws(
    () => assertArchiveWorkflowResult('publishContribution', {
      archiveId: 'archive-1',
      versionId: 'version-1',
      status: 'published',
    }),
    /code/,
  );
  assert.throws(
    () => assertArchiveWorkflowResult('listPublishedMedia', [{
      id: 'attachment-1',
      role: 'portrait',
      storagePath: 'portrait.webp',
      altText: '',
      caption: '',
      sortOrder: 0,
    }]),
    /publicUrl/,
  );
  assert.throws(
    () => assertArchiveWorkflowResult('listContributionMedia', [{
      id: 'attachment-1',
      role: 'portrait',
      storagePath: 'portrait.webp',
      altText: '',
      caption: '',
      sortOrder: 0,
    }]),
    /publicUrl/,
  );
});

test('result contract rejects a draft missing the persisted document content', () => {
  assert.throws(
    () => assertArchiveWorkflowResult('saveDraft', without(draft, 'draft_content')),
    /draft_content/,
  );
});

test('result contract rejects a review queue entry without the owner display name', () => {
  assert.throws(
    () => assertArchiveWorkflowResult('listReviewQueue', [{ ...draft, owner: without(profile, 'display_name'), archive }]),
    /owner\.display_name/,
  );
});

test('result contract rejects a review queue entry without an owner relation', () => {
  assert.throws(
    () => assertArchiveWorkflowResult('listReviewQueue', [{ ...draft, owner: null, archive: null }]),
    /owner/,
  );
});

test('result contract rejects an archive read model missing its sequence number', () => {
  assert.throws(
    () => assertArchiveWorkflowResult('searchArchives', [without(archive, 'sequence_number')]),
    /sequence_number/,
  );
});

test('result contract rejects a public contribution version without document content', () => {
  assert.throws(
    () => assertArchiveWorkflowResult('listArchiveContributions', [{ id: draft.id, archive_id: draft.archive_id, target_contribution_id: null, title: draft.title, kind: draft.kind, status: 'published', created_at: draft.updated_at, owner: { id: profile.id, display_name: profile.display_name }, versions: [without(version, 'content')] }]),
    /versions\[0\]\.content/,
  );
});
