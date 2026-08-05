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

test('clerks can read submitted mainline personnel dossiers and portraits from other clerks', async () => {
  const viewer = {
    id: 'clerk-2', email: 'viewer@example.com', display_name: 'Viewing Clerk', role: 'clerk', enabled: true,
  };
  const harness = await createLocalWorkflowHarness({ principal: viewer });
  const state = createEmptyLocalState();
  state.profiles.push(...structuredClone(LOCAL_PROFILES), viewer);
  state.templates.push(...structuredClone(LOCAL_TEMPLATES));
  state.contributions.push({
    id: 'mainline-person-1', archive_id: null, template_id: '06', owner_id: 'clerk-1',
    title: '安全员', kind: 'new', status: 'submitted', revision: 1,
    draft_content: {
      schemaVersion: 2, templateCode: '06', values: { role: '安全员' },
      mainline: { versionCode: '0.1', part: 1, stage: 1, slotId: 'slot-1', kind: 'personnel' },
    },
    submitter_name: 'Archive Clerk', submitted_at: '2026-07-28T10:00:00.000Z',
    created_at: '2026-07-28T09:00:00.000Z', updated_at: '2026-07-28T10:00:00.000Z',
  });
  state.attachments.push({
    id: 'portrait-1', contribution_id: 'mainline-person-1', owner_id: 'clerk-1', role: 'portrait',
    storage_path: 'clerk-1/mainline-person-1/portrait.webp', mime_type: 'image/webp', byte_size: 1,
    blob: new Blob(['x'], { type: 'image/webp' }), sort_order: 0,
  });
  await harness.seed(state);

  const records = await harness.repository.listMainlinePersonnelSubmissions('0.1');
  const media = await harness.repository.listContributionMedia('mainline-person-1');

  assert.equal(records.length, 1);
  assert.equal(records[0].owner.display_name, 'Archive Clerk');
  assert.equal(media[0].role, 'portrait');
});

test('only administrators can persist independent PART briefs, completion, and stage gates', async () => {
  const harness = await createLocalWorkflowHarness();
  await harness.seedDefaults();
  const saved = await harness.repository.saveMainlineVersion({
    code: '0.1',
    title: '白幕初垂',
    isOpen: true,
    activeStage: 1,
    briefing: {
      activePart: 1,
      parts: {
        1: { status: 'open', activeStage: 1, summary: '第一任务' },
        2: { status: 'complete', activeStage: 3, summary: '第二任务结论' },
      },
    },
  });
  assert.equal(saved.briefing.parts['1'].summary, '第一任务');
  assert.equal(saved.briefing.parts['2'].summary, '第二任务结论');
  assert.equal(saved.briefing.parts['2'].status, 'complete');

  await harness.setPrincipal(LOCAL_PROFILES[1]);
  await assert.rejects(
    () => harness.repository.saveMainlineVersion({
      code: '0.1', title: '白幕初垂', isOpen: true, activeStage: 3, briefing: { activePart: 2 },
    }),
    hasCode('permission_denied'),
  );
});

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

const createDocumentTargetPolicyState = () => {
  const state = createFixedCategoryPolicyState();
  state.archives.find(({ id }) => id === 'station-archive').origin = 'local';
  state.contributions.push(
    {
      id: 'station-document',
      archive_id: 'station-archive',
      template_id: '03',
      owner_id: 'clerk-1',
      target_contribution_id: null,
      base_version_id: null,
      title: 'Station document',
      kind: 'new',
      status: 'published',
      draft_content: { schemaVersion: 2, templateCode: '03', values: {} },
      revision: 1,
    },
    {
      id: 'event-document',
      archive_id: 'event-archive',
      template_id: '07',
      owner_id: 'clerk-1',
      target_contribution_id: null,
      base_version_id: null,
      title: 'Event document',
      kind: 'new',
      status: 'published',
      draft_content: { schemaVersion: 2, templateCode: '07', values: {} },
      revision: 1,
    },
  );
  state.versions.push(
    {
      id: 'station-version',
      archive_id: 'station-archive',
      contribution_id: 'station-document',
      version_label: '0.1',
      content: { schemaVersion: 2, templateCode: '03', values: {} },
      created_at: '2026-07-28T00:00:00.000Z',
    },
    {
      id: 'event-version',
      archive_id: 'event-archive',
      contribution_id: 'event-document',
      version_label: '0.1',
      content: { schemaVersion: 2, templateCode: '07', values: {} },
      created_at: '2026-07-28T00:00:00.000Z',
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
  amendment.base_version_id = targetContributionId === 'original-contribution'
    ? 'original-version'
    : null;
  return state;
};

test('empty local state exposes the workspace note stores alongside workflow data', () => {
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
    'workspaceNotes',
    'workspaceNoteLayouts',
    'archiveStoryPages',
    'mainlineVersions',
    'mainlineStaffSlots',
    'workflowTasks',
    'workflowTaskResponses',
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
    workspaceNotes: [],
    workspaceNoteLayouts: [],
    archiveStoryPages: [],
    mainlineVersions: [],
    mainlineStaffSlots: [],
    workflowTasks: [],
    workflowTaskResponses: [],
  });
});

test('administrators CRUD shared workspace notes in sorted order without mutable aliases', async () => {
  const harness = await createLocalWorkflowHarness({ ids: ['note-later', 'note-first'] });
  await harness.seedDefaults();

  const later = await harness.repository.createWorkspaceNote({
    title: '  稍后处理  ',
    content: '  归档后检查索引。  ',
    sortOrder: 2,
  });
  const first = await harness.repository.createWorkspaceNote({
    title: '优先提醒',
    content: '先完成交接。',
    sortOrder: 1,
  });
  later.content = 'mutated return';
  const listed = await harness.repository.listWorkspaceNotes();
  listed[0].title = 'mutated read';

  assert.deepEqual((await harness.repository.listWorkspaceNotes()).map(({ id, title, content, sort_order, created_by }) => ({
    id, title, content, sort_order, created_by,
  })), [
    {
      id: 'note-first',
      title: '优先提醒',
      content: '先完成交接。',
      sort_order: 1,
      created_by: 'local-admin',
    },
    {
      id: 'note-later',
      title: '稍后处理',
      content: '归档后检查索引。',
      sort_order: 2,
      created_by: 'local-admin',
    },
  ]);

  const updated = await harness.repository.updateWorkspaceNote(first.id, {
    title: '  已更新提醒  ',
    content: '  完成交接后通知管理员。  ',
    sortOrder: 0,
  });
  const deleted = await harness.repository.deleteWorkspaceNote(later.id);

  assert.deepEqual(updated, {
    id: 'note-first',
    title: '已更新提醒',
    content: '完成交接后通知管理员。',
    sort_order: 0,
    created_by: 'local-admin',
    created_at: '2026-07-28T12:00:00.000Z',
    updated_at: '2026-07-28T12:00:00.000Z',
  });
  assert.deepEqual(deleted, { id: 'note-later' });
  assert.deepEqual(
    (await harness.repository.listWorkspaceNotes()).map(({ id, title, sort_order }) => ({ id, title, sort_order })),
    [{ id: 'note-first', title: '已更新提醒', sort_order: 0 }],
  );
  const state = await harness.inspectState();
  assert.equal(state.workspaceNotes[0].title, '已更新提醒');
});

test('clerks read workspace notes but cannot mutate them, while observer and disabled principals are barred', async () => {
  const harness = await createLocalWorkflowHarness();
  await harness.seedDefaults();
  const note = await harness.repository.createWorkspaceNote({
    title: '管理员提示',
    content: '请核对草稿。',
    sortOrder: 0,
  });

  await harness.setPrincipal(LOCAL_PROFILES[1]);
  assert.deepEqual(
    (await harness.repository.listWorkspaceNotes()).map(({ id }) => id),
    [note.id],
  );
  await assert.rejects(
    harness.repository.createWorkspaceNote({ title: '书记官写入', content: '不应保存。', sortOrder: 1 }),
    hasCode('permission_denied'),
  );
  await assert.rejects(
    harness.repository.updateWorkspaceNote(note.id, { title: '改写', content: '不应保存。', sortOrder: 1 }),
    hasCode('permission_denied'),
  );
  await assert.rejects(harness.repository.deleteWorkspaceNote(note.id), hasCode('permission_denied'));

  await harness.setPrincipal({ ...LOCAL_PROFILES[1], role: 'observer' });
  await assert.rejects(harness.repository.listWorkspaceNotes(), hasCode('permission_denied'));
  await harness.setPrincipal({ ...LOCAL_PROFILES[1], enabled: false });
  await assert.rejects(harness.repository.listWorkspaceNotes(), hasCode('permission_denied'));
});

test('workspace note layouts remain self-owned and cascade when their note is deleted', async () => {
  const harness = await createLocalWorkflowHarness({ ids: ['note-layout'] });
  await harness.seedDefaults();
  const note = await harness.repository.createWorkspaceNote({
    title: '位置测试',
    content: '各账号独立保存位置。',
    sortOrder: 0,
  });
  const adminLayout = await harness.repository.saveWorkspaceNoteLayout({
    noteId: note.id,
    profileId: 'local-admin',
    leftPx: 20,
    topPx: 40,
  });
  adminLayout.left_px = 999;

  await harness.setPrincipal(LOCAL_PROFILES[1]);
  const clerkLayout = await harness.repository.saveWorkspaceNoteLayout({
    noteId: note.id,
    profileId: 'clerk-1',
    leftPx: 120,
    topPx: 80,
  });
  assert.deepEqual(await harness.repository.listWorkspaceNoteLayouts('clerk-1'), [clerkLayout]);
  await assert.rejects(
    harness.repository.listWorkspaceNoteLayouts('local-admin'),
    hasCode('permission_denied'),
  );

  await harness.setPrincipal(LOCAL_PROFILES[0]);
  assert.deepEqual(await harness.repository.listWorkspaceNoteLayouts('local-admin'), [{
    note_id: note.id,
    profile_id: 'local-admin',
    left_px: 20,
    top_px: 40,
    updated_at: '2026-07-28T12:00:00.000Z',
  }]);
  await assert.rejects(
    harness.repository.saveWorkspaceNoteLayout({
      noteId: note.id,
      profileId: 'clerk-1',
      leftPx: 1,
      topPx: 1,
    }),
    hasCode('permission_denied'),
  );
  await harness.repository.deleteWorkspaceNote(note.id);

  await harness.setPrincipal(LOCAL_PROFILES[1]);
  assert.deepEqual(await harness.repository.listWorkspaceNoteLayouts('clerk-1'), []);
  const state = await harness.inspectState();
  assert.deepEqual(state.workspaceNoteLayouts, []);
});

test('workspace note content and layout commands reject invalid values without changing local state', async () => {
  const harness = await createLocalWorkflowHarness({ ids: ['valid-note'] });
  await harness.seedDefaults();

  for (const input of [
    { title: ' ', content: '正文', sortOrder: 0 },
    { title: '标题', content: '\n', sortOrder: 0 },
    { title: '标题', content: '正文', sortOrder: -1 },
    { title: '标题', content: '正文', sortOrder: 0.5 },
    { title: '标题', content: '正文', sortOrder: '0' },
  ]) {
    await assert.rejects(harness.repository.createWorkspaceNote(input));
  }
  const note = await harness.repository.createWorkspaceNote({
    title: '有效便签',
    content: '有效正文。',
    sortOrder: 0,
  });
  for (const [leftPx, topPx] of [
    [-1, 0],
    [0, -1],
    [0.5, 0],
    ['0', 0],
    [0, Number.POSITIVE_INFINITY],
  ]) {
    await assert.rejects(
      harness.repository.saveWorkspaceNoteLayout({
        noteId: note.id,
        profileId: 'local-admin',
        leftPx,
        topPx,
      }),
    );
  }

  const state = await harness.inspectState();
  assert.deepEqual(state.workspaceNotes.map(({ id, title }) => ({ id, title })), [
    { id: 'valid-note', title: '有效便签' },
  ]);
  assert.deepEqual(state.workspaceNoteLayouts, []);
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

test('a clerk can create station and entrance drafts', async () => {
  for (const templateId of ['03', '04']) {
    const clerkHarness = await createLocalWorkflowHarness({ principal: LOCAL_PROFILES[1] });
    await clerkHarness.seedDefaults();
    const saved = await clerkHarness.repository.saveDraft({
      ownerId: 'clerk-1',
      templateId,
      title: `书记官类别 ${templateId}`,
      kind: 'new',
      content: { schemaVersion: 2, templateCode: templateId, values: {} },
    });
    assert.equal(saved.status, 'draft');
    assert.equal(saved.owner_id, 'clerk-1');
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

test('deleteDraft removes only the signed-in owner\'s unsubmitted draft', async () => {
  const harness = await createLocalWorkflowHarness({ principal: LOCAL_PROFILES[1] });
  await harness.seedDefaults();
  const saved = await harness.repository.saveDraft({
    ownerId: LOCAL_PROFILES[1].id,
    templateId: '07',
    title: '可删除草稿',
    kind: 'new',
    content: { schemaVersion: 2, templateCode: '07', values: {} },
  });

  await assert.rejects(
    harness.repository.deleteDraft(saved.id, 'local-admin'),
    hasCode('permission_denied'),
  );
  assert.equal((await harness.repository.listMyDrafts(LOCAL_PROFILES[1].id)).length, 1);

  await harness.repository.deleteDraft(saved.id, LOCAL_PROFILES[1].id);
  assert.equal((await harness.repository.listMyDrafts(LOCAL_PROFILES[1].id)).length, 0);
});

test('administrator announcements reach the addressed clerk without exposing an email sender', async () => {
  const harness = await createLocalWorkflowHarness({ principal: LOCAL_PROFILES[0] });
  await harness.seedDefaults();

  const sent = await harness.repository.sendAnnouncement('clerk-1', {
    subject: 'Night shift notice',
    message: 'Use the B duty roster tonight.',
  });
  await harness.setPrincipal(LOCAL_PROFILES[1]);
  const notifications = await harness.repository.listNotifications('clerk-1');

  assert.equal(sent.kind, 'announcement');
  assert.equal(sent.sender_label, 'PALIS 档案管理处');
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].subject, 'Night shift notice');
  assert.equal(notifications[0].contribution, null);
  assert.equal(notifications[0].sender_label, 'PALIS 档案管理处');
  assert.doesNotMatch(JSON.stringify(notifications[0]), /admin@example\.com/);
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
    name: 'source.webp',
    type: 'image/webp',
    size: 3,
    blob: new Blob(['abc'], { type: 'image/webp' }),
  }, {
    role: 'event-evidence',
    caption: '现场记录',
    altText: '雪面上的设备',
    sortOrder: 2,
  });
  attachment.file_name = 'mutated.webp';

  const state = await harness.inspectState();
  assert.equal(state.attachments.length, 1);
  assert.equal(state.attachments[0].file_name, 'source.webp');
  assert.equal(state.attachments[0].byte_size, 3);
  assert.equal(state.attachments[0].role, 'event-evidence');
  assert.equal(state.attachments[0].caption, '现场记录');
  assert.equal(state.attachments[0].alt_text, '雪面上的设备');
  assert.equal(state.attachments[0].sort_order, 2);
  assert.equal(await state.attachments[0].blob.text(), 'abc');
});

test('role-based local media rejects non-WebP and files above 800KB', async () => {
  const harness = await createLocalWorkflowHarness({ principal: LOCAL_PROFILES[1] });
  await harness.seedDefaults();
  const saved = await saveEventDraft(harness);
  const invalid = (name, type, size) => harness.repository.uploadAttachment(
    saved.id,
    'clerk-1',
    {
      name,
      type,
      size,
      blob: new Blob([new Uint8Array(size)], { type }),
    },
    { role: 'event-cover' },
  );

  await assert.rejects(
    invalid('cover.png', 'image/png', 3),
    hasCode('invalid_media_file'),
  );
  await assert.rejects(
    invalid('cover.webp', 'image/webp', 800 * 1024 + 1),
    hasCode('invalid_media_file'),
  );
});

test('clerk attachments lock after submission while an administrator may inspect submitted media', async () => {
  const harness = await createLocalWorkflowHarness({ principal: LOCAL_PROFILES[1] });
  await harness.seedDefaults();
  const saved = await saveEventDraft(harness);
  await harness.repository.uploadAttachment(saved.id, 'clerk-1', {
    name: 'cover.webp',
    type: 'image/webp',
    size: 3,
    blob: new Blob(['abc'], { type: 'image/webp' }),
  }, {
    role: 'event-cover',
    altText: '待审事件封面',
  });
  await harness.repository.submitDraft(saved.id, 'clerk-1');

  await assert.rejects(
    harness.repository.uploadAttachment(saved.id, 'clerk-1', {
      name: 'late.webp',
      type: 'image/webp',
      size: 3,
      blob: new Blob(['xyz'], { type: 'image/webp' }),
    }, { role: 'event-evidence' }),
    hasCode('attachment_locked'),
  );

  await harness.setPrincipal(LOCAL_PROFILES[0]);
  const media = await harness.repository.listContributionMedia(saved.id);
  assert.equal(media.length, 1);
  assert.equal(media[0].role, 'event-cover');
  assert.match(media[0].publicUrl, /^(blob:|data:)/);
});

test('a clerk cannot inspect another owner draft media', async () => {
  const harness = await createLocalWorkflowHarness({ principal: LOCAL_PROFILES[1] });
  await harness.seedDefaults();
  const saved = await saveEventDraft(harness);
  await harness.repository.uploadAttachment(saved.id, 'clerk-1', {
    name: 'cover.webp',
    type: 'image/webp',
    size: 3,
    blob: new Blob(['abc'], { type: 'image/webp' }),
  }, { role: 'event-cover' });
  await harness.setPrincipal({
    id: 'clerk-2',
    email: 'other@example.com',
    display_name: 'Other Clerk',
    role: 'clerk',
    enabled: true,
  });

  await assert.rejects(
    harness.repository.listContributionMedia(saved.id),
    hasCode('permission_denied'),
  );
});

test('local media roles enforce one event cover and at most six evidence images', async () => {
  const harness = await createLocalWorkflowHarness({ principal: LOCAL_PROFILES[1] });
  await harness.seedDefaults();
  const saved = await saveEventDraft(harness);
  const upload = (name, role, sortOrder) => harness.repository.uploadAttachment(
    saved.id,
    'clerk-1',
    {
      name,
      type: 'image/webp',
      size: 1,
      blob: new Blob(['x'], { type: 'image/webp' }),
    },
    { role, sortOrder },
  );

  await upload('cover-1.webp', 'event-cover', 0);
  await assert.rejects(upload('cover-2.webp', 'event-cover', 0), hasCode('media_slot_full'));
  for (let index = 0; index < 6; index += 1) {
    await upload(`evidence-${index}.webp`, 'event-evidence', index);
  }
  await assert.rejects(
    upload('evidence-7.webp', 'event-evidence', 6),
    hasCode('media_slot_full'),
  );
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

test('archive reference search can return every public archive when the slash picker asks for the full list', async () => {
  const state = createPublishedReadState();
  for (let sequence = 28; sequence <= 78; sequence += 1) {
    state.archives.push({
      ...structuredClone(state.archives[0]),
      id: `reference-${sequence}`,
      code: `EV${sequence}`,
      title: `Reference event ${sequence}`,
      sequence_number: sequence,
    });
  }
  const harness = await createLocalWorkflowHarness();
  await harness.seed(state);

  const references = await harness.repository.searchArchives('', { limit: 500 });

  assert.equal(references.length, 52);
  assert.deepEqual(references.map(({ id }) => id), [
    'archive-1',
    ...Array.from({ length: 51 }, (_, index) => `reference-${index + 28}`),
  ]);
});

test('slash references can search public archive story pages by their actual message content', async () => {
  const state = createPublishedReadState();
  state.archiveStoryPages.push({
    id: 'story-page-1',
    archive_id: 'archive-1',
    author_id: 'clerk-1',
    author_name: '记录员',
    title: '夜间观察',
    body: '冰窗边缘出现了新的蓝色孢子反应。',
    created_at: '2026-08-05T00:00:00.000Z',
    updated_at: '2026-08-05T00:00:00.000Z',
  });
  const harness = await createLocalWorkflowHarness();
  await harness.seed(state);

  const results = await harness.repository.searchArchiveStoryPages('蓝色孢子', { limit: 20 });

  assert.equal(results.length, 1);
  assert.equal(results[0].id, 'story-page-1');
  assert.deepEqual(results[0].archive, {
    id: 'archive-1', code: 'EV27', title: '公开事件', visibility: 'public',
  });
});

test('published archive pagination honors offset without loading document bodies', async () => {
  const state = createPublishedReadState();
  state.archives.push(
    {
      ...structuredClone(state.archives[0]),
      id: 'archive-4',
      code: 'EV28',
      sequence_number: 28,
      title: '第二公开事件',
      published_at: '2026-07-29T12:00:00.000Z',
    },
    {
      ...structuredClone(state.archives[0]),
      id: 'archive-5',
      code: 'EV29',
      sequence_number: 29,
      title: '第三公开事件',
      published_at: '2026-07-30T12:00:00.000Z',
    },
  );
  const harness = await createLocalWorkflowHarness();
  await harness.seed(state);

  const page = await harness.repository.listPublishedArchives({ limit: 1, offset: 1 });

  assert.deepEqual(page.map(({ id }) => id), ['archive-4']);
  assert.equal(Object.hasOwn(page[0], 'versions'), false);
});

test('archive documents exclude amendments and expose their latest immutable version', async () => {
  const state = createPublishedReadState();
  state.contributions.push({
    ...structuredClone(state.contributions[0]),
    id: 'amendment-1',
    kind: 'amendment',
    target_contribution_id: 'contribution-1',
    title: '修订内容',
  });
  const harness = await createLocalWorkflowHarness();
  await harness.seed(state);

  const documents = await harness.repository.listArchiveDocuments('archive-1');

  assert.deepEqual(documents, [{
    id: 'contribution-1',
    title: '公开事件材料',
    kind: 'new',
    latestVersionId: 'version-2',
    versionLabel: '0.2',
    ownerName: 'Archive Clerk',
  }]);
});

test('published media returns metadata and a transient readable URL only for published documents', async () => {
  const state = createPublishedReadState();
  state.attachments.push({
    id: 'attachment-1',
    contribution_id: 'contribution-1',
    owner_id: 'clerk-1',
    storage_path: 'clerk-1/contribution-1/cover.webp',
    file_name: 'cover.webp',
    mime_type: 'image/webp',
    byte_size: 3,
    role: 'event-cover',
    caption: '现场记录',
    alt_text: '雪面上的设备',
    sort_order: 0,
    blob: new Blob(['abc'], { type: 'image/webp' }),
    created_at: '2026-07-28T12:00:00.000Z',
  });
  const harness = await createLocalWorkflowHarness();
  await harness.seed(state);

  const media = await harness.repository.listPublishedMedia('contribution-1');

  assert.equal(media.length, 1);
  assert.deepEqual(
    {
      id: media[0].id,
      role: media[0].role,
      storagePath: media[0].storagePath,
      altText: media[0].altText,
      caption: media[0].caption,
      sortOrder: media[0].sortOrder,
    },
    {
      id: 'attachment-1',
      role: 'event-cover',
      storagePath: 'clerk-1/contribution-1/cover.webp',
      altText: '雪面上的设备',
      caption: '现场记录',
      sortOrder: 0,
    },
  );
  assert.match(media[0].publicUrl, /^(blob:|data:)/);
});

test('published directory projects only the event cover and never its evidence images', async () => {
  const state = createPublishedReadState();
  state.attachments.push(
    {
      id: 'attachment-cover',
      contribution_id: 'contribution-1',
      owner_id: 'clerk-1',
      storage_path: 'clerk-1/contribution-1/cover.webp',
      file_name: 'cover.webp',
      mime_type: 'image/webp',
      byte_size: 3,
      role: 'event-cover',
      sort_order: 0,
      blob: new Blob(['abc'], { type: 'image/webp' }),
      created_at: '2026-07-28T12:00:00.000Z',
    },
    {
      id: 'attachment-evidence',
      contribution_id: 'contribution-1',
      owner_id: 'clerk-1',
      storage_path: 'clerk-1/contribution-1/evidence.webp',
      file_name: 'evidence.webp',
      mime_type: 'image/webp',
      byte_size: 3,
      role: 'event-evidence',
      sort_order: 1,
      blob: new Blob(['xyz'], { type: 'image/webp' }),
      created_at: '2026-07-28T12:00:00.000Z',
    },
  );
  const harness = await createLocalWorkflowHarness();
  await harness.seed(state);

  const [archive] = await harness.repository.listPublishedArchives();

  assert.match(archive.cover_url, /^(blob:|data:)/);
  assert.doesNotMatch(archive.cover_url, /evidence/i);
});

test('administrator can toggle one archive NEW badge without changing its published identity', async () => {
  const state = createPublishedReadState();
  state.archives[0].new_badge_visible = true;
  const harness = await createLocalWorkflowHarness();
  await harness.seed(state);

  const changed = await harness.repository.setArchiveNewBadge('archive-1', false);
  const committed = await harness.inspectState();

  assert.deepEqual(changed, { id: 'archive-1', new_badge_visible: false });
  assert.equal(committed.archives[0].code, 'EV27');
  assert.equal(committed.archives[0].new_badge_visible, false);
});

test('published contribution views expose immutable versions without mutable state aliases', async () => {
  const harness = await createLocalWorkflowHarness();
  await harness.seed(createPublishedReadState());

  const source = await harness.repository.loadArchiveEditorSource('archive-1');
  const contributions = await harness.repository.listArchiveContributions('archive-1');
  contributions[0].versions[1].content.sections[0].title = 'mutated view';

  assert.equal(source.archiveId, 'archive-1');
  assert.equal(source.contributionId, 'contribution-1');
  assert.equal(source.versionId, 'version-2');
  assert.deepEqual(source.content, { schemaVersion: 2, sections: [{ title: 'latest' }] });
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
  assert.equal(
    committed.notifications[0].message,
    '027.RLL / VER 0.1 / Archive Clerk',
  );
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
    ['event', '07', 'EV02', '002.RLL'],
    ['anomaly', '08', 'A04', '004.TRC'],
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
    origin: 'official',
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

test('loadArchiveEditorSource honors the selected document and base version', async () => {
  const state = createPublishedReadState();
  state.versions[0].content = {
    schemaVersion: 2,
    templateCode: '07',
    values: { hero: 'Document A base', custom: 'preserved' },
    indexData: { title: 'Document A base' },
    sections: [{ id: 'body', label: 'Body', fields: ['custom'] }],
    fieldLabels: { custom: 'Custom label' },
    references: [{ archiveId: 'archive-2', code: 'OLD', label: 'Stale label' }],
    media: [{ field: 'photo', attachmentId: 'attachment-a' }],
  };
  state.contributions.push({
    ...structuredClone(state.contributions[0]),
    id: 'contribution-newer',
    title: 'Newer sibling document',
    created_at: '2026-07-29T10:00:00.000Z',
    updated_at: '2026-07-29T12:00:00.000Z',
  });
  state.versions.push({
    ...structuredClone(state.versions[1]),
    id: 'version-newer',
    contribution_id: 'contribution-newer',
    created_at: '2026-07-29T12:00:00.000Z',
    approved_at: '2026-07-29T12:00:00.000Z',
    content: {
      schemaVersion: 2,
      templateCode: '07',
      values: { hero: 'Wrong newer sibling' },
    },
  });
  state.archives.find(({ id }) => id === 'archive-2').code = 'P99';
  state.archives.find(({ id }) => id === 'archive-2').title = 'Fresh reference label';
  state.references[0].contribution_id = 'contribution-1';
  const harness = await createLocalWorkflowHarness();
  await harness.seed(state);

  const source = await harness.repository.loadArchiveEditorSource('archive-1', {
    contributionId: 'contribution-1',
    versionId: 'version-1',
  });

  assert.equal(source.sourceKind, 'document');
  assert.equal(source.contributionId, 'contribution-1');
  assert.equal(source.versionId, 'version-1');
  assert.equal(source.content.values.hero, 'Document A base');
  assert.equal(source.content.values.custom, 'preserved');
  assert.deepEqual(source.content.sections, [{ id: 'body', label: 'Body', fields: ['custom'] }]);
  assert.deepEqual(source.content.fieldLabels, { custom: 'Custom label' });
  assert.deepEqual(source.content.references, [{
    archiveId: 'archive-2',
    code: 'OLD',
    label: 'Stale label',
  }]);
  assert.deepEqual(source.content.media, [{ field: 'photo', attachmentId: 'attachment-a' }]);
  assert.deepEqual(source.references, [{
    archiveId: 'archive-2',
    code: 'P99',
    label: 'Fresh reference label',
  }]);
  assert.equal(source.mediaContributionId, 'contribution-1');
  assert.equal(source.version.id, 'version-1');
  source.content.values.hero = 'mutated';
  assert.equal((await harness.inspectState()).versions[0].content.values.hero, 'Document A base');
});

test('loadArchiveEditorSource never substitutes a sibling when the selected source is missing', async () => {
  const harness = await createLocalWorkflowHarness();
  await harness.seed(createPublishedReadState());

  const source = await harness.repository.loadArchiveEditorSource('archive-1', {
    contributionId: 'contribution-1',
    versionId: 'missing-version',
  });

  assert.equal(source, null);
});

test('loadArchiveEditorSource rejects a selected version whose archive lineage mismatches its document', async () => {
  const state = createPublishedReadState();
  state.versions[0].archive_id = 'archive-2';
  const harness = await createLocalWorkflowHarness();
  await harness.seed(state);

  const source = await harness.repository.loadArchiveEditorSource('archive-1', {
    contributionId: 'contribution-1',
    versionId: 'version-1',
  });

  assert.equal(source, null);
});

test('official editor source uses static content until a later official amendment is published', async () => {
  const state = createPublishedReadState();
  state.archives[0] = {
    ...state.archives[0],
    code: 'EV01',
    sequence_number: 1,
    category: 'event',
    title: 'HZ-6 official record',
    origin: 'official',
  };
  state.contributions = [];
  state.versions = [];
  state.references = [];
  const harness = await createLocalWorkflowHarness();
  await harness.seed(state);

  const staticSource = await harness.repository.loadArchiveEditorSource('archive-1', {
    officialBase: true,
  });

  assert.equal(staticSource.sourceKind, 'official-static');
  assert.equal(staticSource.contributionId, null);
  assert.equal(staticSource.versionId, null);
  assert.equal(staticSource.content.schemaVersion, 2);
  assert.equal(staticSource.content.values.hero, 'HZ-6 official record');
  assert.notEqual(staticSource.content.values['legacy:official-body'].trim(), '');

  state.contributions.push({
    id: 'official-amendment',
    archive_id: 'archive-1',
    template_id: '07',
    owner_id: 'clerk-1',
    target_contribution_id: null,
    title: 'Official amendment',
    kind: 'amendment',
    status: 'published',
    draft_content: { schemaVersion: 2, templateCode: '07', values: {} },
    revision: 1,
    created_at: '2026-07-29T10:00:00.000Z',
    updated_at: '2026-07-29T12:00:00.000Z',
  });
  state.versions.push({
    id: 'official-amendment-version',
    archive_id: 'archive-1',
    contribution_id: 'official-amendment',
    version_label: '0.2',
    content: {
      schemaVersion: 2,
      templateCode: '07',
      values: { hero: 'Published official amendment' },
    },
    approved_at: '2026-07-29T12:00:00.000Z',
    created_at: '2026-07-29T12:00:00.000Z',
    submitter_id: 'clerk-1',
    submitter_name: 'Archive Clerk',
    modifier_id: 'clerk-1',
    modifier_name: 'Archive Clerk',
    reviewer_id: 'local-admin',
    reviewer_name: 'Local Administrator',
  });
  await harness.seed(state);

  const amendedSource = await harness.repository.loadArchiveEditorSource('archive-1', {
    officialBase: true,
  });

  assert.equal(amendedSource.sourceKind, 'official-amendment');
  assert.equal(amendedSource.contributionId, 'official-amendment');
  assert.equal(amendedSource.versionId, 'official-amendment-version');
  assert.equal(amendedSource.content.values.hero, 'Published official amendment');
});

test('archive base source preserves a community archive when it has no native document yet', async () => {
  const state = createPublishedReadState();
  state.archives[0] = {
    ...state.archives[0],
    origin: 'community',
    title: 'Existing community event',
    summary: 'Existing archive summary',
    index_payload: { title: 'Existing community event', status: 'published' },
  };
  state.contributions = [];
  state.versions = [];
  const harness = await createLocalWorkflowHarness();
  await harness.seed(state);

  const source = await harness.repository.loadArchiveEditorSource('archive-1', {
    officialBase: true,
  });

  assert.equal(source.sourceKind, 'official-static');
  assert.equal(source.contributionId, null);
  assert.equal(source.versionId, null);
  assert.equal(source.content.schemaVersion, 2);
  assert.equal(source.content.values.hero, 'Existing community event');
  assert.match(source.content.values['legacy:archive-system-record'], /Existing archive summary/);
});

test('publishing an amendment refreshes the existing archive directory projection', async () => {
  const identity = {
    id: 'archive-existing',
    code: 'ST20',
    business_code: 'STATION-ORIGINAL',
    category: 'station',
    title: 'Old station',
    summary: 'Old summary',
    visibility: 'public',
    origin: 'official',
    sequence_number: 20,
    abbreviation: 'LOG',
    index_payload: {
      title: 'Old station',
      latitude: '-70.0',
      longitude: '10.0',
      owner: 'LEGACY',
    },
    current_version_id: null,
    published_at: '2026-07-27T12:00:00.000Z',
  };
  const state = createApprovedPublicationState({
    category: 'station',
    templateId: '03',
    archive: identity,
  });
  state.contributions[0].draft_content = {
    schemaVersion: 2,
    templateCode: '03',
    summary: 'Updated station summary',
    values: {},
    indexData: {
      title: 'New station name',
      latitude: '-71.2',
      longitude: '12.4',
      owner: 'PALIS',
      stationType: 'observation',
      status: 'archived',
    },
  };
  const harness = await createLocalWorkflowHarness();
  await harness.seed(state);

  await harness.repository.publishContribution('submission-1', {
    archiveId: 'archive-existing',
    code: 'MUST-NOT-REPLACE',
    category: 'station',
    version: '0.2',
    visibility: 'public',
    idempotencyKey: 'publish-station-amendment',
  });

  const [archive] = await harness.repository.listPublishedArchives();
  assert.equal(archive.id, 'archive-existing');
  assert.equal(archive.code, 'ST20');
  assert.equal(archive.category, 'station');
  assert.equal(archive.title, 'New station name');
  assert.equal(archive.summary, 'Updated station summary');
  assert.deepEqual(archive.index_payload, {
    title: 'New station name',
    latitude: '-71.2',
    longitude: '12.4',
    owner: 'PALIS',
    stationType: 'observation',
    status: 'archived',
  });
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

test('submitting an amendment rejects a document from another archive', async () => {
  const harness = await createLocalWorkflowHarness({ principal: LOCAL_PROFILES[1] });
  await harness.seed(createDocumentTargetPolicyState());
  const saved = await harness.repository.saveDraft({
    ownerId: 'clerk-1',
    templateId: '03',
    archiveId: 'station-archive',
    kind: 'amendment',
    targetContributionId: 'event-document',
    baseVersionId: 'event-version',
    title: 'Cross archive amendment',
    content: { schemaVersion: 2, templateCode: '03', values: {} },
  });

  await assert.rejects(
    harness.repository.submitDraft(saved.id, 'clerk-1'),
    hasCode('invalid_target'),
  );
});

test('submitting an amendment rejects a base version from another document', async () => {
  const harness = await createLocalWorkflowHarness({ principal: LOCAL_PROFILES[1] });
  await harness.seed(createDocumentTargetPolicyState());
  const saved = await harness.repository.saveDraft({
    ownerId: 'clerk-1',
    templateId: '03',
    archiveId: 'station-archive',
    kind: 'amendment',
    targetContributionId: 'station-document',
    baseVersionId: 'event-version',
    title: 'Wrong base version amendment',
    content: { schemaVersion: 2, templateCode: '03', values: {} },
  });

  await assert.rejects(
    harness.repository.submitDraft(saved.id, 'clerk-1'),
    hasCode('invalid_target'),
  );
});

test('submitting a targeted amendment requires an immutable base version', async () => {
  const harness = await createLocalWorkflowHarness({ principal: LOCAL_PROFILES[1] });
  await harness.seed(createDocumentTargetPolicyState());
  const saved = await harness.repository.saveDraft({
    ownerId: 'clerk-1',
    templateId: '03',
    archiveId: 'station-archive',
    kind: 'amendment',
    targetContributionId: 'station-document',
    baseVersionId: null,
    title: 'Missing base version amendment',
    content: { schemaVersion: 2, templateCode: '03', values: {} },
  });

  await assert.rejects(
    harness.repository.submitDraft(saved.id, 'clerk-1'),
    hasCode('invalid_target'),
  );
});

test('any archive record can submit an amendment without a document target', async () => {
  for (const origin of ['local', 'official', 'community']) {
    const state = createDocumentTargetPolicyState();
    state.archives.find(({ id }) => id === 'station-archive').origin = origin;
    const harness = await createLocalWorkflowHarness({ principal: LOCAL_PROFILES[1] });
    await harness.seed(state);
    const saved = await harness.repository.saveDraft({
      ownerId: 'clerk-1',
      templateId: '03',
      archiveId: 'station-archive',
      kind: 'amendment',
      title: 'Official base amendment',
      content: { schemaVersion: 2, templateCode: '03', values: {} },
    });

    assert.equal(
      (await harness.repository.submitDraft(saved.id, 'clerk-1')).status,
      'submitted',
    );
  }
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

  assert.equal(published.versionLabel, '0.1');
  assert.equal(amendment.versions[0].version_label, '0.1');
  assert.deepEqual(amendment.versions[0].submitter, {
    id: 'original-author',
    display_name: 'Original Author',
  });
  assert.deepEqual(amendment.versions[0].modifier, {
    id: 'clerk-1',
    display_name: 'Archive Clerk',
  });
});

test('publication rejects an amendment whose target is no longer resolvable', async () => {
  const harness = await createLocalWorkflowHarness();
  await harness.seed(createAmendmentAttributionState('missing-contribution'));

  await assert.rejects(
    harness.repository.publishContribution('submission-1', {
      archiveId: 'archive-attribution',
      category: 'event',
      version: '0.2',
      visibility: 'public',
      idempotencyKey: 'publish-attribution-fallback',
    }),
    hasCode('invalid_target'),
  );
});

test('publication rejects an amendment when the base no longer belongs to its target', async () => {
  const state = createAmendmentAttributionState();
  state.versions[0].contribution_id = 'unrelated-contribution';
  state.versions[0].submitter_id = 'clerk-1';
  state.versions[0].submitter_name = 'Archive Clerk';
  const harness = await createLocalWorkflowHarness();
  await harness.seed(state);

  await assert.rejects(
    harness.repository.publishContribution('submission-1', {
      archiveId: 'archive-attribution',
      category: 'event',
      version: '0.2',
      visibility: 'public',
      idempotencyKey: 'publish-target-precedence',
    }),
    hasCode('invalid_target'),
  );
});

test('publication cannot redirect an approved amendment into another archive', async () => {
  const state = createAmendmentAttributionState();
  state.archives.push({
    ...structuredClone(state.archives[0]),
    id: 'archive-other',
    code: 'EV10',
    sequence_number: 10,
  });
  const harness = await createLocalWorkflowHarness();
  await harness.seed(state);

  await assert.rejects(
    harness.repository.publishContribution('submission-1', {
      archiveId: 'archive-other',
      category: 'event',
      visibility: 'public',
      idempotencyKey: 'redirect-amendment',
    }),
    hasCode('invalid_target'),
  );
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
