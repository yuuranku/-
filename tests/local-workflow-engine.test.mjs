import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyLocalState } from '../src/archive-workflow/local/local-state.js';
import {
  createLocalWorkflowHarness,
  LOCAL_PROFILES,
  LOCAL_TEMPLATES,
} from './helpers/local-workflow-harness.mjs';
import { defineArchiveWorkflowRepositoryConformance } from './helpers/archive-workflow-repository-conformance.mjs';

const hasCode = (code) => (error) => error?.code === code;

const saveEventDraft = (harness, title = '事件草稿') => harness.repository.saveDraft({
  ownerId: 'clerk-1',
  templateId: '07',
  title,
  kind: 'new',
  content: { schemaVersion: 2, templateCode: '07', values: {} },
});

const createPublishedReadState = () => {
  const state = createEmptyLocalState();
  state.profiles.push(...structuredClone(LOCAL_PROFILES));
  state.templates.push(...structuredClone([
    {
      id: '07',
      code: '07',
      category: 'event',
      abbreviation: 'RLL',
      title: '事件档案',
      schema: { schemaVersion: 2 },
      active: true,
    },
  ]));
  state.archives.push(
    {
      id: 'archive-1',
      code: 'EV27',
      category: 'event',
      title: '公开事件',
      summary: '公开摘要',
      visibility: 'public',
      origin: 'local',
      sequence_number: 27,
      abbreviation: 'RLL',
      current_version_id: 'version-2',
      published_at: '2026-07-28T12:00:00.000Z',
    },
    {
      id: 'archive-2',
      code: 'P12',
      category: 'person',
      title: '内部人物',
      summary: '内部摘要',
      visibility: 'sealed',
      origin: 'local',
      sequence_number: 12,
      abbreviation: 'PER',
      current_version_id: null,
      published_at: null,
    },
    {
      id: 'archive-3',
      code: 'A04',
      category: 'anomaly',
      title: '可删除异常',
      summary: '',
      visibility: 'offline',
      origin: 'local',
      sequence_number: 4,
      abbreviation: 'TRC',
      current_version_id: null,
      published_at: null,
    },
  );
  state.contributions.push({
    id: 'contribution-1',
    archive_id: 'archive-1',
    template_id: '07',
    owner_id: 'clerk-1',
    target_contribution_id: null,
    title: '公开事件材料',
    kind: 'new',
    status: 'published',
    draft_content: { schemaVersion: 2, sections: [{ title: 'current draft' }] },
    revision: 2,
    created_at: '2026-07-28T10:00:00.000Z',
    updated_at: '2026-07-28T12:00:00.000Z',
  });
  state.versions.push(
    {
      id: 'version-1',
      archive_id: 'archive-1',
      contribution_id: 'contribution-1',
      version_label: '0.1',
      content: { schemaVersion: 2, sections: [{ title: 'first' }] },
      approved_at: '2026-07-28T11:00:00.000Z',
      created_at: '2026-07-28T11:00:00.000Z',
      submitter_id: 'clerk-1',
      submitter_name: 'Archive Clerk',
      modifier_id: null,
      modifier_name: null,
      reviewer_id: 'local-admin',
      reviewer_name: 'Local Administrator',
    },
    {
      id: 'version-2',
      archive_id: 'archive-1',
      contribution_id: 'contribution-1',
      version_label: '0.2',
      content: { schemaVersion: 2, sections: [{ title: 'latest' }] },
      approved_at: '2026-07-28T12:00:00.000Z',
      created_at: '2026-07-28T12:00:00.000Z',
      submitter_id: 'clerk-1',
      submitter_name: 'Archive Clerk',
      modifier_id: 'clerk-1',
      modifier_name: 'Archive Clerk',
      reviewer_id: 'local-admin',
      reviewer_name: 'Local Administrator',
    },
  );
  state.references.push({
    id: 'reference-1',
    source_archive_id: 'archive-2',
    target_archive_id: 'archive-1',
    needs_review: false,
    created_at: '2026-07-28T12:00:00.000Z',
  });
  return state;
};

const createApprovedPublicationState = ({
  category = 'event',
  templateId = '07',
  contributionId = 'submission-1',
  archive = null,
} = {}) => {
  const state = createEmptyLocalState();
  state.profiles.push(...structuredClone(LOCAL_PROFILES));
  state.templates.push(...structuredClone(LOCAL_TEMPLATES));
  if (archive) state.archives.push(structuredClone(archive));
  state.contributions.push({
    id: contributionId,
    archive_id: archive?.id ?? null,
    template_id: templateId,
    owner_id: 'clerk-1',
    target_contribution_id: null,
    title: `${category} publication`,
    kind: archive ? 'amendment' : 'new',
    status: 'approved',
    draft_content: {
      schemaVersion: 2,
      templateCode: templateId,
      values: { summary: `${category} summary` },
    },
    revision: 1,
    submitter_id: 'clerk-1',
    submitter_name: 'Archive Clerk',
    system_version: '0.1',
    system_theme: '白幕初垂',
    submitted_at: '2026-07-28T10:00:00.000Z',
    reviewer_id: 'local-admin',
    reviewer_name: 'Local Administrator',
    reviewed_at: '2026-07-28T11:00:00.000Z',
    created_at: '2026-07-28T09:00:00.000Z',
    updated_at: '2026-07-28T11:00:00.000Z',
  });
  return state;
};

const formalNumber = (archive) =>
  `${String(archive.sequence_number).padStart(3, '0')}.${archive.abbreviation}`;

const createFixedCategoryPolicyState = () => {
  const state = createEmptyLocalState();
  state.profiles.push(...structuredClone(LOCAL_PROFILES));
  state.templates.push(...structuredClone(LOCAL_TEMPLATES));
  state.archives.push(
    {
      id: 'station-archive',
      code: 'ST4',
      category: 'station',
      title: 'Existing station',
      visibility: 'public',
      sequence_number: 4,
      abbreviation: 'LOG',
    },
    {
      id: 'event-archive',
      code: 'EV2',
      category: 'event',
      title: 'Existing event',
      visibility: 'public',
      sequence_number: 2,
      abbreviation: 'RLL',
    },
  );
  return state;
};

const createAmendmentAttributionState = (targetContributionId = 'original-contribution') => {
  const archive = {
    id: 'archive-attribution',
    code: 'EV9',
    business_code: 'ORIGINAL-EVENT',
    category: 'event',
    title: 'Attribution event',
    summary: '',
    visibility: 'public',
    origin: 'local',
    sequence_number: 9,
    abbreviation: 'RLL',
    current_version_id: 'original-version',
    published_at: '2026-07-27T12:00:00.000Z',
  };
  const state = createApprovedPublicationState({ archive });
  state.profiles.push({
    id: 'original-author',
    email: 'original@example.com',
    display_name: 'Original Author',
    role: 'clerk',
    enabled: true,
  });
  state.contributions.unshift({
    id: 'original-contribution',
    archive_id: archive.id,
    template_id: '07',
    owner_id: 'original-author',
    target_contribution_id: null,
    title: 'Original contribution',
    kind: 'new',
    status: 'published',
    draft_content: { schemaVersion: 2, sections: [{ title: 'original' }] },
    revision: 1,
    submitter_id: 'original-author',
    submitter_name: 'Original Author',
    created_at: '2026-07-27T10:00:00.000Z',
    updated_at: '2026-07-27T12:00:00.000Z',
  });
  state.versions.push({
    id: 'original-version',
    archive_id: archive.id,
    contribution_id: 'original-contribution',
    version_label: '0.1',
    content: { schemaVersion: 2, sections: [{ title: 'original' }] },
    approved_at: '2026-07-27T12:00:00.000Z',
    created_at: '2026-07-27T12:00:00.000Z',
    submitter_id: 'original-author',
    submitter_name: 'Original Author',
    modifier_id: null,
    modifier_name: null,
    reviewer_id: 'local-admin',
    reviewer_name: 'Local Administrator',
  });
  const amendment = state.contributions.find(({ id }) => id === 'submission-1');
  amendment.owner_id = 'clerk-1';
  amendment.submitter_id = 'clerk-1';
  amendment.submitter_name = 'Archive Clerk';
  amendment.target_contribution_id = targetContributionId;
  return state;
};

test('empty local state exposes only the thirteen unseeded workflow stores', () => {
  const state = createEmptyLocalState();

  assert.deepEqual(Object.keys(state), [
    'profiles',
    'templates',
    'archives',
    'contributions',
    'versions',
    'reviews',
    'indexEntries',
    'numberCounters',
    'notifications',
    'references',
    'attachments',
    'auditEvents',
    'idempotencyResults',
  ]);
  assert.deepEqual(state, {
    profiles: [],
    templates: [],
    archives: [],
    contributions: [],
    versions: [],
    reviews: [],
    indexEntries: [],
    numberCounters: {},
    notifications: [],
    references: [],
    attachments: [],
    auditEvents: [],
    idempotencyResults: {},
  });
});

test('saveDraft derives administrator ownership from the command-time principal', async () => {
  const harness = await createLocalWorkflowHarness();
  await harness.seedDefaults();

  const saved = await harness.repository.saveDraft({
    ownerId: 'spoofed-user',
    templateId: '07',
    title: '本地事件',
    kind: 'new',
    content: { schemaVersion: 2, templateCode: '07', values: {} },
  });

  assert.equal(saved.owner_id, 'local-admin');
  assert.equal(saved.draft_content.schemaVersion, 2);
  assert.deepEqual(harness.metrics(), { commitCount: 1, transactionCount: 1, readCount: 0 });
});

test('saveDraft rejects a clerk who tries to impersonate another owner', async () => {
  const harness = await createLocalWorkflowHarness({ principal: LOCAL_PROFILES[1] });
  await harness.seedDefaults();

  await assert.rejects(
    harness.repository.saveDraft({
      ownerId: 'another-user',
      templateId: '07',
      title: '冒充草稿',
      kind: 'new',
      content: { schemaVersion: 2, templateCode: '07', values: {} },
    }),
    hasCode('permission_denied'),
  );

  assert.deepEqual(harness.metrics(), { commitCount: 0, transactionCount: 1, readCount: 0 });
});

test('read methods use snapshots without opening transactions or leaking mutable state', async () => {
  const harness = await createLocalWorkflowHarness();
  await harness.seedDefaults();

  const profile = await harness.repository.getProfile('local-admin');
  const templates = await harness.repository.listTemplates();
  const drafts = await harness.repository.listMyDrafts('local-admin');
  profile.display_name = 'mutated profile';
  templates[0].title = 'mutated template';

  const state = await harness.inspectState();
  assert.equal(state.profiles[0].display_name, 'Local Administrator');
  assert.equal(state.templates[0].title, '国家档案');
  assert.deepEqual(drafts, []);
  assert.deepEqual(harness.metrics(), { commitCount: 0, transactionCount: 0, readCount: 3 });
});

test('saveDraft enforces schema version 2, returns deep copies, and detects stale revisions', async () => {
  const harness = await createLocalWorkflowHarness();
  await harness.seedDefaults();

  await assert.rejects(
    harness.repository.saveDraft({
      ownerId: 'local-admin',
      templateId: '07',
      title: '旧文档',
      content: { schemaVersion: 1 },
    }),
    hasCode('invalid_document'),
  );
  const saved = await harness.repository.saveDraft({
    ownerId: 'local-admin',
    templateId: '07',
    title: '事件草稿',
    content: { schemaVersion: 2, sections: [] },
  });
  saved.draft_content.sections.push({ title: 'mutated result' });
  const updated = await harness.repository.saveDraft({
    id: saved.id,
    ownerId: 'local-admin',
    revision: saved.revision,
    templateId: '07',
    title: '事件草稿第二版',
    content: { schemaVersion: 2, sections: [{ title: '第二版' }] },
  });
  const conflict = await harness.repository.saveDraft({
    id: saved.id,
    ownerId: 'local-admin',
    revision: saved.revision,
    templateId: '07',
    title: '过期保存',
    content: { schemaVersion: 2, sections: [] },
  });

  assert.equal(updated.revision, 2);
  assert.deepEqual(updated.draft_content.sections, [{ title: '第二版' }]);
  assert.equal(conflict.status, 'conflict');
  assert.equal(conflict.conflict, true);
  assert.equal(conflict.cloud.revision, 2);
  const state = await harness.inspectState();
  assert.deepEqual(state.contributions[0].draft_content.sections, [{ title: '第二版' }]);
});

test('submitDraft freezes the exact command-time submitter and PALIS version snapshot', async () => {
  const harness = await createLocalWorkflowHarness({ principal: LOCAL_PROFILES[1] });
  await harness.seedDefaults();
  const saved = await harness.repository.saveDraft({
    ownerId: 'clerk-1',
    templateId: '07',
    title: '待提交事件',
    content: { schemaVersion: 2, sections: [] },
  });
  await harness.setPrincipal({
    ...LOCAL_PROFILES[1],
    display_name: 'Archive Clerk At Submit',
  });
  harness.resetMetrics();

  const submitted = await harness.repository.submitDraft(saved.id, 'clerk-1');

  assert.equal(submitted.status, 'submitted');
  assert.deepEqual(
    {
      submitter_id: submitted.submitter_id,
      submitter_name: submitted.submitter_name,
      system_version: submitted.system_version,
      system_theme: submitted.system_theme,
      submitted_at: submitted.submitted_at,
    },
    {
      submitter_id: 'clerk-1',
      submitter_name: 'Archive Clerk At Submit',
      system_version: '0.1',
      system_theme: '白幕初垂',
      submitted_at: '2026-07-28T12:00:00.000Z',
    },
  );
  assert.deepEqual(harness.metrics(), { commitCount: 1, transactionCount: 1, readCount: 0 });
});

test('new station and entrance drafts require an administrator', async () => {
  for (const templateId of ['03', '04']) {
    const clerkHarness = await createLocalWorkflowHarness({ principal: LOCAL_PROFILES[1] });
    await clerkHarness.seedDefaults();
    await assert.rejects(
      clerkHarness.repository.saveDraft({
        ownerId: 'clerk-1',
        templateId,
        title: `受限类别 ${templateId}`,
        kind: 'new',
        content: { schemaVersion: 2, templateCode: templateId, values: {} },
      }),
      hasCode('permission_denied'),
    );
    assert.equal((await clerkHarness.inspectState()).contributions.length, 0);

    const adminHarness = await createLocalWorkflowHarness();
    await adminHarness.seedDefaults();
    const saved = await adminHarness.repository.saveDraft({
      ownerId: 'ignored-owner',
      templateId,
      title: `管理员类别 ${templateId}`,
      kind: 'new',
      content: { schemaVersion: 2, templateCode: templateId, values: {} },
    });
    assert.equal(saved.owner_id, 'local-admin');
    assert.equal(saved.template_id, templateId);
  }
});

test('reviewSubmission accepts only approval or a non-empty change request', async () => {
  const harness = await createLocalWorkflowHarness({ principal: LOCAL_PROFILES[1] });
  await harness.seedDefaults();
  const saved = await saveEventDraft(harness);
  await harness.repository.submitDraft(saved.id, 'clerk-1');
  await harness.setPrincipal(LOCAL_PROFILES[0]);

  await assert.rejects(
    harness.repository.reviewSubmission(saved.id, { decision: 'rejected', message: 'No' }),
    hasCode('invalid_decision'),
  );
  await assert.rejects(
    harness.repository.reviewSubmission(saved.id, { decision: 'approved', message: ' ' }),
    hasCode('reply_required'),
  );
  const reviewed = await harness.repository.reviewSubmission(saved.id, {
    decision: 'changes_requested',
    message: '请补充来源卷',
  });

  assert.equal(reviewed.status, 'changes_requested');
  const state = await harness.inspectState();
  assert.equal(state.reviews.length, 1);
  assert.deepEqual(
    {
      contribution_id: state.reviews[0].contribution_id,
      reviewer_id: state.reviews[0].reviewer_id,
      decision: state.reviews[0].decision,
      message: state.reviews[0].message,
    },
    {
      contribution_id: saved.id,
      reviewer_id: 'local-admin',
      decision: 'changes_requested',
      message: '请补充来源卷',
    },
  );
});

test('saving a change request preserves contribution identity and increments revision', async () => {
  const harness = await createLocalWorkflowHarness({ principal: LOCAL_PROFILES[1] });
  await harness.seedDefaults();
  const saved = await saveEventDraft(harness);
  await harness.repository.submitDraft(saved.id, 'clerk-1');
  await harness.setPrincipal(LOCAL_PROFILES[0]);
  const changed = await harness.repository.reviewSubmission(saved.id, {
    decision: 'changes_requested',
    message: '请补充来源卷',
  });
  await harness.setPrincipal(LOCAL_PROFILES[1]);

  const revised = await harness.repository.saveDraft({
    id: changed.id,
    ownerId: 'clerk-1',
    revision: changed.revision,
    templateId: '07',
    title: '补充来源后的事件',
    content: { schemaVersion: 2, templateCode: '07', values: { source: 'R-19' } },
  });

  assert.equal(revised.id, saved.id);
  assert.equal(revised.revision, 2);
  assert.equal(revised.status, 'draft');
  assert.equal((await harness.inspectState()).contributions.length, 1);
});

test('each command evaluates the principal role again', async () => {
  const harness = await createLocalWorkflowHarness({ principal: LOCAL_PROFILES[1] });
  await harness.seedDefaults();
  const saved = await saveEventDraft(harness);
  await harness.repository.submitDraft(saved.id, 'clerk-1');
  harness.resetMetrics();

  await assert.rejects(
    harness.repository.reviewSubmission(saved.id, {
      decision: 'approved',
      message: '书记官不得审核',
    }),
    hasCode('permission_denied'),
  );
  await harness.setPrincipal({ ...LOCAL_PROFILES[1], role: 'admin' });
  const approved = await harness.repository.reviewSubmission(saved.id, {
    decision: 'approved',
    message: '即时角色已生效',
  });

  assert.equal(approved.status, 'approved');
  assert.deepEqual(harness.metrics(), { commitCount: 1, transactionCount: 2, readCount: 0 });
});

test('administrator account commands validate then discard plaintext passwords', async () => {
  const harness = await createLocalWorkflowHarness();
  await harness.seedDefaults();
  await assert.rejects(
    harness.repository.createUser({
      email: 'new@example.com',
      displayName: 'New Clerk',
      role: 'clerk',
      password: 'short',
    }),
    hasCode('invalid_password'),
  );

  const created = await harness.repository.createUser({
    email: 'new@example.com',
    displayName: 'New Clerk',
    role: 'clerk',
    password: 'NEVER_STORE_CREATE_123',
  });
  const reset = await harness.repository.resetUserPassword(created.id, 'NEVER_STORE_RESET_456');
  const users = await harness.repository.listUsers();
  const state = await harness.inspectState();
  const exported = JSON.stringify({ created, reset, users, state });

  assert.equal(created.email, 'new@example.com');
  assert.equal(reset.id, created.id);
  assert.doesNotMatch(exported, /NEVER_STORE_CREATE_123|NEVER_STORE_RESET_456/);
  assert.doesNotMatch(exported, /"password"/i);
});

test('clerks cannot review submissions or administer accounts', async () => {
  const harness = await createLocalWorkflowHarness({ principal: LOCAL_PROFILES[1] });
  await harness.seedDefaults();
  const saved = await saveEventDraft(harness);
  await harness.repository.submitDraft(saved.id, 'clerk-1');

  await assert.rejects(
    harness.repository.reviewSubmission(saved.id, {
      decision: 'approved',
      message: 'not authorized',
    }),
    hasCode('permission_denied'),
  );
  await assert.rejects(
    harness.repository.createUser({
      email: 'blocked@example.com',
      displayName: 'Blocked',
      role: 'clerk',
      password: 'valid-secret',
    }),
    hasCode('permission_denied'),
  );
  await assert.rejects(
    harness.repository.deleteUser('local-admin'),
    hasCode('permission_denied'),
  );
});

test('review replies create owner notifications that only the recipient can mark read', async () => {
  const harness = await createLocalWorkflowHarness({ principal: LOCAL_PROFILES[1] });
  await harness.seedDefaults();
  const saved = await saveEventDraft(harness);
  await harness.repository.submitDraft(saved.id, 'clerk-1');
  await harness.setPrincipal(LOCAL_PROFILES[0]);
  await harness.repository.reviewSubmission(saved.id, {
    decision: 'changes_requested',
    message: '请补附件',
  });
  await harness.setPrincipal(LOCAL_PROFILES[1]);

  const notifications = await harness.repository.listNotifications('clerk-1');
  const marked = await harness.repository.markNotificationRead(notifications[0].id, 'clerk-1');

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].message, '请补附件');
  assert.equal(notifications[0].contribution.title, '事件草稿');
  assert.equal(notifications[0].read_at, null);
  assert.equal(marked.read_at, '2026-07-28T12:00:00.000Z');
});

test('uploadAttachment stores a 1-byte to 5MB Blob and returns an isolated metadata copy', async () => {
  const harness = await createLocalWorkflowHarness({ principal: LOCAL_PROFILES[1] });
  await harness.seedDefaults();
  const saved = await saveEventDraft(harness);

  for (const size of [0, 5 * 1024 * 1024 + 1]) {
    await assert.rejects(
      harness.repository.uploadAttachment(saved.id, 'clerk-1', {
        name: 'invalid.bin',
        type: 'application/octet-stream',
        size,
        blob: new Blob([]),
      }),
      hasCode('invalid_attachment'),
    );
  }
  const attachment = await harness.repository.uploadAttachment(saved.id, 'clerk-1', {
    name: 'source.txt',
    type: 'text/plain',
    size: 3,
    blob: new Blob(['abc'], { type: 'text/plain' }),
  });
  attachment.file_name = 'mutated.txt';

  const state = await harness.inspectState();
  assert.equal(state.attachments.length, 1);
  assert.equal(state.attachments[0].file_name, 'source.txt');
  assert.equal(state.attachments[0].byte_size, 3);
  assert.equal(await state.attachments[0].blob.text(), 'abc');
});

test('archive directories apply public, editable, administrator, query, and category filters', async () => {
  const harness = await createLocalWorkflowHarness();
  await harness.seed(createPublishedReadState());

  const searched = await harness.repository.searchArchives('EV27', { limit: 20 });
  const published = await harness.repository.listPublishedArchives({ limit: 20 });
  const editable = await harness.repository.listEditableArchives({ category: 'person', limit: 20 });
  const admin = await harness.repository.listAdminArchives({ query: '可删除', limit: 20 });

  assert.deepEqual(searched.map(({ id }) => id), ['archive-1']);
  assert.deepEqual(published.map(({ id }) => id), ['archive-1']);
  assert.deepEqual(editable.map(({ id }) => id), ['archive-2']);
  assert.deepEqual(admin.map(({ id }) => id), ['archive-3']);
  assert.deepEqual(harness.metrics(), { commitCount: 0, transactionCount: 0, readCount: 4 });
});

test('published contribution views expose immutable versions without mutable state aliases', async () => {
  const harness = await createLocalWorkflowHarness();
  await harness.seed(createPublishedReadState());

  const source = await harness.repository.loadArchiveEditorSource('archive-1');
  const contributions = await harness.repository.listArchiveContributions('archive-1');
  contributions[0].versions[1].content.sections[0].title = 'mutated view';

  assert.deepEqual(source, {
    archiveId: 'archive-1',
    contributionId: 'contribution-1',
    versionId: 'version-2',
    content: { schemaVersion: 2, sections: [{ title: 'latest' }] },
  });
  assert.equal(contributions[0].owner.display_name, 'Archive Clerk');
  assert.equal(contributions[0].versions[1].reviewer.display_name, 'Local Administrator');
  assert.equal((await harness.inspectState()).versions[1].content.sections[0].title, 'latest');
});

test('archive reference views resolve their source archive relation', async () => {
  const harness = await createLocalWorkflowHarness();
  await harness.seed(createPublishedReadState());

  const references = await harness.repository.listArchiveReferences('archive-1');

  assert.equal(references.length, 1);
  assert.deepEqual(references[0].source_archive, {
    id: 'archive-2',
    code: 'P12',
    title: '内部人物',
    visibility: 'sealed',
  });
});

test('deleteArchive rejects versioned or referenced identities and removes a clean archive once', async () => {
  const harness = await createLocalWorkflowHarness();
  await harness.seed(createPublishedReadState());

  await assert.rejects(
    harness.repository.deleteArchive('archive-1'),
    hasCode('archive_has_history'),
  );
  await assert.rejects(
    harness.repository.deleteArchive('archive-2'),
    hasCode('archive_has_history'),
  );
  harness.resetMetrics();
  const removed = await harness.repository.deleteArchive('archive-3');

  assert.deepEqual(removed, {
    id: 'archive-3',
    code: 'A04',
    title: '可删除异常',
  });
  assert.equal((await harness.inspectState()).archives.some(({ id }) => id === 'archive-3'), false);
  assert.deepEqual(harness.metrics(), { commitCount: 1, transactionCount: 1, readCount: 0 });
});

test('publishContribution atomically allocates event 27 without overwriting its formal abbreviation', async () => {
  const state = createApprovedPublicationState();
  state.numberCounters.event = 26;
  const harness = await createLocalWorkflowHarness({
    ids: ['archive-1', 'version-1', 'index-1', 'audit-1', 'notification-1'],
  });
  await harness.seed(state);

  const result = await harness.repository.publishContribution('submission-1', {
    code: 'HZ-6',
    category: 'event',
    version: '0.1',
    visibility: 'public',
    idempotencyKey: 'publish-1',
  });

  assert.deepEqual(result, {
    archiveId: 'archive-1',
    versionId: 'version-1',
    status: 'published',
    code: 'EV27',
    sequenceNumber: 27,
    abbreviation: 'RLL',
    formalNumber: '027.RLL',
    versionLabel: '0.1',
  });
  const committed = await harness.inspectState();
  const archive = committed.archives[0];
  assert.equal(archive.code, 'EV27');
  assert.equal(archive.business_code, 'HZ-6');
  assert.equal(archive.sequence_number, 27);
  assert.equal(archive.abbreviation, 'RLL');
  assert.equal(formalNumber(archive), '027.RLL');
  assert.equal(committed.numberCounters.event, 27);
  assert.equal(committed.versions.length, 1);
  assert.deepEqual(
    {
      dossierNo: committed.versions[0].content.values.dossierNo,
      entryCode: committed.versions[0].content.values.entryCode,
      regDate: committed.versions[0].content.values.regDate,
      clerk: committed.versions[0].content.values.clerk,
    },
    {
      dossierNo: '027.RLL',
      entryCode: 'EV27',
      regDate: '2026-07-28',
      clerk: 'Archive Clerk',
    },
  );
  assert.equal(committed.indexEntries.length, 1);
  assert.equal(committed.auditEvents.length, 1);
  assert.equal(committed.notifications.length, 1);
  assert.deepEqual(harness.metrics(), { commitCount: 1, transactionCount: 1, readCount: 0 });
});

test('automatic publication maps all nine singular categories to fixed code prefixes and abbreviations', async () => {
  const cases = [
    ['country', '01', 'N19', '019.REG'],
    ['organization', '02', 'O25', '025.CHN'],
    ['station', '03', 'ST21', '021.LOG'],
    ['entrance', '04', 'EN19', '019.CRD'],
    ['ecology', '05', 'E08', '008.ECO'],
    ['person', '06', 'P47', '047.PER'],
    ['event', '07', 'EV27', '027.RLL'],
    ['anomaly', '08', 'A26', '026.TRC'],
    ['species', '09', 'S23', '023.SPC'],
  ];
  const state = createEmptyLocalState();
  state.profiles.push(...structuredClone(LOCAL_PROFILES));
  state.templates.push(...structuredClone(LOCAL_TEMPLATES));
  for (const [category, templateId] of cases) {
    const fixture = createApprovedPublicationState({
      category,
      templateId,
      contributionId: `submission-${category}`,
    });
    state.contributions.push(fixture.contributions[0]);
  }
  const harness = await createLocalWorkflowHarness();
  await harness.seed(state);

  for (const [category, , expectedCode, expectedFormalNumber] of cases) {
    const published = await harness.repository.publishContribution(`submission-${category}`, {
      category,
      version: '0.1',
      visibility: 'public',
      idempotencyKey: `publish-${category}`,
    });
    const committed = await harness.inspectState();
    const archive = committed.archives.find(({ id }) => id === published.archiveId);
    assert.equal(archive.code, expectedCode, `${category} code`);
    assert.equal(formalNumber(archive), expectedFormalNumber, `${category} formal number`);
    assert.equal(published.formalNumber, expectedFormalNumber, `${category} publication result`);
    const version = committed.versions.find(({ id }) => id === published.versionId);
    assert.equal(version.content.values.entryCode, expectedCode, `${category} stamped code`);
    assert.equal(version.content.values.dossierNo, expectedFormalNumber, `${category} stamped dossier`);
  }
});

test('publishing an amendment preserves the existing archive code, sequence, and abbreviation', async () => {
  const identity = {
    id: 'archive-existing',
    code: 'EV26',
    business_code: 'ORIGINAL-CODE',
    category: 'event',
    title: 'Existing event',
    summary: '',
    visibility: 'public',
    origin: 'local',
    sequence_number: 26,
    abbreviation: 'RLL',
    current_version_id: null,
    published_at: '2026-07-27T12:00:00.000Z',
  };
  const state = createApprovedPublicationState({ archive: identity });
  state.numberCounters.event = 26;
  const harness = await createLocalWorkflowHarness({
    ids: ['version-amendment', 'index-amendment', 'audit-amendment', 'notification-amendment'],
  });
  await harness.seed(state);

  const result = await harness.repository.publishContribution('submission-1', {
    archiveId: 'archive-existing',
    code: 'MUST-NOT-REPLACE',
    category: 'event',
    version: '0.2',
    visibility: 'public',
    idempotencyKey: 'publish-amendment',
  });

  const committed = await harness.inspectState();
  const archive = committed.archives[0];
  assert.equal(result.archiveId, 'archive-existing');
  assert.equal(archive.code, 'EV26');
  assert.equal(archive.business_code, 'ORIGINAL-CODE');
  assert.equal(archive.sequence_number, 26);
  assert.equal(archive.abbreviation, 'RLL');
  assert.equal(committed.numberCounters.event, 26);
});

test('publication idempotency retries before counters and rejects key reuse with a different payload', async () => {
  const state = createApprovedPublicationState();
  state.numberCounters.event = 26;
  const harness = await createLocalWorkflowHarness();
  await harness.seed(state);

  const first = await harness.repository.publishContribution('submission-1', {
    category: 'event',
    version: '0.1',
    visibility: 'public',
    idempotencyKey: 'publish-once',
  });
  const afterFirst = await harness.inspectState();
  const retry = await harness.repository.publishContribution('submission-1', {
    category: 'event',
    version: '0.1',
    visibility: 'public',
    idempotencyKey: 'publish-once',
  });
  const afterRetry = await harness.inspectState();

  assert.deepEqual(retry, first);
  assert.deepEqual(afterRetry, afterFirst);
  assert.equal(afterRetry.numberCounters.event, 27);
  assert.equal(afterRetry.versions.length, 1);
  assert.equal(afterRetry.notifications.length, 1);
  assert.equal(afterRetry.auditEvents.length, 1);

  await assert.rejects(
    harness.repository.publishContribution('submission-1', {
      category: 'event',
      visibility: 'sealed',
      idempotencyKey: 'publish-once',
    }),
    hasCode('idempotency_conflict'),
  );
  assert.deepEqual(await harness.inspectState(), afterFirst);
});

test('clerks cannot publish approved contributions', async () => {
  const harness = await createLocalWorkflowHarness({ principal: LOCAL_PROFILES[1] });
  await harness.seed(createApprovedPublicationState());

  await assert.rejects(
    harness.repository.publishContribution('submission-1', {
      category: 'event',
      version: '0.1',
      visibility: 'public',
      idempotencyKey: 'blocked-publish',
    }),
    hasCode('permission_denied'),
  );
  assert.deepEqual(harness.metrics(), { commitCount: 0, transactionCount: 1, readCount: 0 });
});

test('each publication failpoint rolls back the entire state and commit count', async () => {
  for (const point of ['version', 'projection', 'archive', 'index', 'audit', 'notification']) {
    const state = createApprovedPublicationState();
    state.numberCounters.event = 26;
    const harness = await createLocalWorkflowHarness();
    await harness.seed(state);
    harness.setFailPoint(point);
    const before = await harness.inspectState();

    await assert.rejects(
      harness.repository.publishContribution('submission-1', {
        category: 'event',
        version: '0.1',
        visibility: 'public',
        idempotencyKey: `fail-${point}`,
      }),
      (error) => error?.code === 'injected_failure' && error?.point === point,
    );

    assert.deepEqual(await harness.inspectState(), before, `${point} state`);
    assert.deepEqual(
      harness.metrics(),
      { commitCount: 0, transactionCount: 1, readCount: 0 },
      `${point} metrics`,
    );
  }
});

test('a clerk cannot reclassify an existing event draft as a station draft', async () => {
  const harness = await createLocalWorkflowHarness({ principal: LOCAL_PROFILES[1] });
  await harness.seed(createFixedCategoryPolicyState());
  const saved = await saveEventDraft(harness);

  await assert.rejects(
    harness.repository.saveDraft({
      id: saved.id,
      ownerId: 'clerk-1',
      revision: saved.revision,
      templateId: '03',
      archiveId: 'station-archive',
      kind: 'new',
      title: 'Reclassified station',
      content: { schemaVersion: 2, templateCode: '03', values: {} },
    }),
    hasCode('permission_denied'),
  );

  const state = await harness.inspectState();
  assert.equal(state.contributions[0].template_id, '07');
  assert.equal(state.contributions[0].revision, 1);
});

test('fixed-category clerk drafts reject new or contribution kinds even with a real archive', async () => {
  for (const kind of ['new', 'contribution']) {
    const harness = await createLocalWorkflowHarness({ principal: LOCAL_PROFILES[1] });
    await harness.seed(createFixedCategoryPolicyState());

    await assert.rejects(
      harness.repository.saveDraft({
        ownerId: 'clerk-1',
        templateId: '03',
        archiveId: 'station-archive',
        kind,
        title: `Blocked ${kind}`,
        content: { schemaVersion: 2, templateCode: '03', values: {} },
      }),
      hasCode('permission_denied'),
    );
  }
});

test('fixed-category clerk amendments require a real archive of the same category', async () => {
  for (const archiveId of [null, 'missing-station', 'event-archive']) {
    const harness = await createLocalWorkflowHarness({ principal: LOCAL_PROFILES[1] });
    await harness.seed(createFixedCategoryPolicyState());

    await assert.rejects(
      harness.repository.saveDraft({
        ownerId: 'clerk-1',
        templateId: '03',
        archiveId,
        kind: 'amendment',
        title: 'Invalid station amendment',
        content: { schemaVersion: 2, templateCode: '03', values: {} },
      }),
      hasCode('permission_denied'),
    );
  }
});

test('a clerk can save a station amendment against a real station archive', async () => {
  const harness = await createLocalWorkflowHarness({ principal: LOCAL_PROFILES[1] });
  await harness.seed(createFixedCategoryPolicyState());

  const saved = await harness.repository.saveDraft({
    ownerId: 'clerk-1',
    templateId: '03',
    archiveId: 'station-archive',
    kind: 'amendment',
    title: 'Station supplement',
    content: { schemaVersion: 2, templateCode: '03', values: {} },
  });

  assert.equal(saved.kind, 'amendment');
  assert.equal(saved.archive_id, 'station-archive');
  assert.equal(saved.template_id, '03');
});

test('an amendment public version keeps the target author as submitter and current owner as modifier', async () => {
  const harness = await createLocalWorkflowHarness();
  await harness.seed(createAmendmentAttributionState());

  const published = await harness.repository.publishContribution('submission-1', {
    archiveId: 'archive-attribution',
    category: 'event',
    version: '9.9',
    visibility: 'public',
    idempotencyKey: 'publish-attribution',
  });
  const contributions = await harness.repository.listArchiveContributions(published.archiveId);
  const amendment = contributions.find(({ id }) => id === 'submission-1');

  assert.equal(published.versionLabel, '0.2');
  assert.equal(amendment.versions[0].version_label, '0.2');
  assert.deepEqual(amendment.versions[0].submitter, {
    id: 'original-author',
    display_name: 'Original Author',
  });
  assert.deepEqual(amendment.versions[0].modifier, {
    id: 'clerk-1',
    display_name: 'Archive Clerk',
  });
});

test('an amendment without a resolvable target falls back to the archive version submitter', async () => {
  const harness = await createLocalWorkflowHarness();
  await harness.seed(createAmendmentAttributionState('missing-contribution'));

  const published = await harness.repository.publishContribution('submission-1', {
    archiveId: 'archive-attribution',
    category: 'event',
    version: '0.2',
    visibility: 'public',
    idempotencyKey: 'publish-attribution-fallback',
  });
  const contributions = await harness.repository.listArchiveContributions(published.archiveId);
  const amendment = contributions.find(({ id }) => id === 'submission-1');

  assert.equal(amendment.versions[0].submitter.id, 'original-author');
  assert.equal(amendment.versions[0].modifier.id, 'clerk-1');
});

test('a resolvable target contribution author takes precedence over an unrelated archive version', async () => {
  const state = createAmendmentAttributionState();
  state.versions[0].contribution_id = 'unrelated-contribution';
  state.versions[0].submitter_id = 'clerk-1';
  state.versions[0].submitter_name = 'Archive Clerk';
  const harness = await createLocalWorkflowHarness();
  await harness.seed(state);

  const published = await harness.repository.publishContribution('submission-1', {
    archiveId: 'archive-attribution',
    category: 'event',
    version: '0.2',
    visibility: 'public',
    idempotencyKey: 'publish-target-precedence',
  });
  const contributions = await harness.repository.listArchiveContributions(published.archiveId);
  const amendment = contributions.find(({ id }) => id === 'submission-1');

  assert.equal(amendment.versions[0].submitter.id, 'original-author');
  assert.equal(amendment.versions[0].modifier.id, 'clerk-1');
});

test('sealed and offline archives expose no public contribution records', async () => {
  for (const visibility of ['sealed', 'offline']) {
    const state = createPublishedReadState();
    state.archives[0].visibility = visibility;
    const harness = await createLocalWorkflowHarness();
    await harness.seed(state);

    assert.deepEqual(await harness.repository.listArchiveContributions('archive-1'), []);
  }
});

test('a sealed archive remains available to the editor source reader', async () => {
  const state = createPublishedReadState();
  state.archives[0].visibility = 'sealed';
  const harness = await createLocalWorkflowHarness();
  await harness.seed(state);

  const source = await harness.repository.loadArchiveEditorSource('archive-1');

  assert.equal(source.archiveId, 'archive-1');
  assert.equal(source.versionId, 'version-2');
});

test('review and audit authors are disabled instead of physically deleted', async () => {
  const state = createEmptyLocalState();
  state.profiles.push(
    structuredClone(LOCAL_PROFILES[0]),
    {
      id: 'reviewer-only',
      email: 'reviewer@example.com',
      display_name: 'Historical Reviewer',
      role: 'clerk',
      enabled: true,
    },
    {
      id: 'auditor-only',
      email: 'auditor@example.com',
      display_name: 'Historical Auditor',
      role: 'clerk',
      enabled: true,
    },
  );
  state.reviews.push({
    id: 'review-1',
    contribution_id: 'historical-contribution',
    reviewer_id: 'reviewer-only',
    decision: 'approved',
    message: 'Historical approval',
    created_at: '2026-07-27T12:00:00.000Z',
  });
  state.auditEvents.push({
    id: 'audit-historical',
    actor_id: 'auditor-only',
    action: 'historical_action',
    target_type: 'archive',
    target_id: 'archive-historical',
    created_at: '2026-07-27T12:00:00.000Z',
  });
  const harness = await createLocalWorkflowHarness();
  await harness.seed(state);

  const reviewed = await harness.repository.deleteUser('reviewer-only');
  const audited = await harness.repository.deleteUser('auditor-only');

  assert.deepEqual(reviewed, {
    id: 'reviewer-only',
    status: 'disabled',
    disabled: true,
    deleted: false,
  });
  assert.deepEqual(audited, {
    id: 'auditor-only',
    status: 'disabled',
    disabled: true,
    deleted: false,
  });
  const committed = await harness.inspectState();
  assert.equal(committed.profiles.find(({ id }) => id === 'reviewer-only').enabled, false);
  assert.equal(committed.profiles.find(({ id }) => id === 'auditor-only').enabled, false);
});

test('deleting a user without attribution history reports deleted status', async () => {
  const state = createEmptyLocalState();
  state.profiles.push(
    structuredClone(LOCAL_PROFILES[0]),
    {
      id: 'unused-user',
      email: 'unused@example.com',
      display_name: 'Unused User',
      role: 'clerk',
      enabled: true,
    },
  );
  const harness = await createLocalWorkflowHarness();
  await harness.seed(state);

  const result = await harness.repository.deleteUser('unused-user');

  assert.deepEqual(result, {
    id: 'unused-user',
    status: 'deleted',
    disabled: false,
    deleted: true,
  });
  assert.equal((await harness.inspectState()).profiles.some(({ id }) => id === 'unused-user'), false);
});

defineArchiveWorkflowRepositoryConformance(
  'local transactional workflow engine',
  () => createLocalWorkflowHarness(),
);
