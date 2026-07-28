import test from 'node:test';
import assert from 'node:assert/strict';

import { assertArchiveWorkflowResult } from '../src/archive-workflow/repository-contract.js';

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
    ['listNotifications', [{ id: 'notification-1', subject: 'Draft reviewed', created_at: '2026-07-28T00:00:00.000Z', message: 'Please revise', kind: 'changes_requested', read_at: null, contribution: { title: draft.title } }]],
    ['markNotificationRead', { id: 'notification-1', read_at: '2026-07-28T00:00:00.000Z' }],
    ['searchArchives', [archive]],
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
  ];

  for (const [method, result] of cases) {
    assert.doesNotThrow(() => assertArchiveWorkflowResult(method, result), method);
  }
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
