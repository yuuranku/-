import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createArchiveWorkflowClient } from '../src/archive-workflow/client.js';
import { createSupabaseArchiveWorkflowRepository } from '../src/archive-workflow/repositories/supabase-repository.js';
import { ARCHIVE_WORKFLOW_METHODS } from '../src/archive-workflow/repository-contract.js';

const projectRoot = new URL('../', import.meta.url);
const clientSourceUrl = new URL('src/archive-workflow/client.js', projectRoot);
const repositorySourceUrl = new URL('src/archive-workflow/repositories/supabase-repository.js', projectRoot);
const authSourceUrl = new URL('src/auth.js', projectRoot);

test('workflow client exposes the complete clerk and administrator API', () => {
  const client = createArchiveWorkflowClient({
    from: () => {
      throw new Error('not used');
    },
    rpc: () => {
      throw new Error('not used');
    },
    functions: { invoke: () => { throw new Error('not used'); } },
  });
  for (const method of ARCHIVE_WORKFLOW_METHODS) {
    assert.equal(typeof client[method], 'function', `${method} should be exported`);
  }
});

test('workflow client reexports the Supabase repository factory by identity', async () => {
  const [clientSource, repositorySource] = await Promise.all([
    readFile(clientSourceUrl, 'utf8'),
    readFile(repositorySourceUrl, 'utf8'),
  ]);

  assert.equal(createArchiveWorkflowClient, createSupabaseArchiveWorkflowRepository);
  assert.match(clientSource, /createSupabaseArchiveWorkflowRepository\s+as\s+createArchiveWorkflowClient/);
  assert.match(repositorySource, /return\s+assertArchiveWorkflowRepository\(\{/);
});

test('workflow client preserves validation error codes at its repository boundary', async () => {
  const client = createArchiveWorkflowClient({
    from: () => { throw new Error('not used'); },
    rpc: () => { throw new Error('not used'); },
    functions: { invoke: () => { throw new Error('not used'); } },
  });
  const hasCode = (code) => (error) => error?.code === code;

  await assert.rejects(client.getProfile(''), hasCode('invalid_input'));
  await assert.rejects(client.saveDraft({ id: 'draft-1', ownerId: 'clerk-1', revision: 0 }), hasCode('invalid_revision'));
  assert.throws(() => client.reviewSubmission('draft-1', { decision: 'rejected', message: 'No' }), hasCode('invalid_decision'));
  assert.throws(() => client.reviewSubmission('draft-1', { decision: 'approved', message: ' ' }), hasCode('reply_required'));
  assert.throws(() => client.createUser({ email: 'clerk@example.com', displayName: 'Clerk', role: 'clerk', password: 'short' }), hasCode('invalid_password'));
  await assert.rejects(client.uploadAttachment('draft-1', 'clerk-1', { name: 'too-large.bin', size: 5 * 1024 * 1024 + 1 }), hasCode('invalid_attachment'));
});

test('workflow client only writes current-version archive documents after revision validation', async () => {
  const writes = [];
  const client = createArchiveWorkflowClient({
    from: () => ({
      insert: (payload) => ({
        select: () => ({
          single: async () => {
            writes.push(payload);
            return { data: { id: 'draft-1', ...payload, revision: 1, updated_at: '2026-07-28T00:00:00.000Z' }, error: null };
          },
        }),
      }),
    }),
    rpc: () => { throw new Error('not used'); },
    functions: { invoke: () => { throw new Error('not used'); } },
  });
  const hasCode = (code) => (error) => error?.code === code;

  await assert.rejects(client.saveDraft({ ownerId: 'clerk-1', title: 'Legacy', content: { schemaVersion: 1 } }), hasCode('invalid_document'));
  await assert.rejects(client.saveDraft({ ownerId: 'clerk-1', title: 'Missing document' }), hasCode('invalid_document'));
  await assert.rejects(client.saveDraft({ id: 'draft-1', ownerId: 'clerk-1', revision: 0, content: { schemaVersion: 1 } }), hasCode('invalid_revision'));

  const saved = await client.saveDraft({ ownerId: 'clerk-1', title: 'Current', content: { schemaVersion: 2, sections: [] } });
  assert.equal(saved.draft_content.schemaVersion, 2);
  assert.equal(writes.length, 1);
});

test('public archive records use the sanitized RPC and attachments use the private bucket', async () => {
  const calls = [];
  const client = createArchiveWorkflowClient({
    from: (table) => ({
      insert: (payload) => ({
        select: () => ({
          single: async () => {
            calls.push({ kind: 'insert', table, payload });
            return { data: payload, error: null };
          },
        }),
      }),
    }),
    rpc: async (name, args) => {
      calls.push({ kind: 'rpc', name, args });
      return { data: [], error: null };
    },
    functions: { invoke: () => { throw new Error('not used'); } },
    storage: {
      from: (bucket) => ({
        upload: async (path, file, options) => {
          calls.push({ kind: 'upload', bucket, path, file, options });
          return { data: { path }, error: null };
        },
      }),
    },
  });

  await client.listArchiveContributions('archive-1');
  await client.uploadAttachment('contribution-1', 'owner-1', {
    name: 'HZ-6记录.pdf',
    type: 'application/pdf',
    size: 1024,
  });

  assert.equal(calls[0].name, 'list_public_archive_contributions');
  assert.equal(calls[1].bucket, 'archive-attachments');
  assert.equal(calls[2].table, 'archive_attachments');
  assert.equal(calls[2].payload.byte_size, 1024);
});

test('privileged actions use RPC or the administrator Edge Function', async () => {
  const calls = [];
  const client = createArchiveWorkflowClient({
    from: () => {
      throw new Error('not used');
    },
    rpc: async (name, args) => {
      calls.push({ kind: 'rpc', name, args });
      return { data: { ok: true }, error: null };
    },
    functions: {
      invoke: async (name, options) => {
        calls.push({ kind: 'function', name, options });
        return { data: { status: 'invited' }, error: null };
      },
    },
  });

  await client.reviewSubmission('submission-1', { decision: 'approved', message: '准予录入' });
  await client.publishContribution('submission-1', {
    archiveId: 'archive-hz6',
    code: 'HZ-6',
    category: 'event',
    version: '0.1',
    marks: ['archival'],
    visibility: 'public',
  });
  await client.inviteUser({ email: 'clerk@example.com', displayName: '书记官甲', role: 'clerk' });

  assert.equal(calls[0].name, 'review_archive_submission');
  assert.equal(calls[1].name, 'publish_archive_contribution');
  assert.equal(calls[1].args.p_code, null);
  assert.equal(calls[1].args.p_business_code, 'HZ-6');
  assert.equal(calls[1].args.p_version, '0.1');
  assert.equal(calls[2].name, 'admin-invite-user');
});

test('new archive publication leaves the formal identifier empty for the server', async () => {
  const calls = [];
  const client = createArchiveWorkflowClient({
    from: () => {
      throw new Error('not used');
    },
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: { archiveId: 'archive-1', versionId: 'version-1', status: 'published' }, error: null };
    },
    functions: { invoke: async () => ({ data: null, error: null }) },
  });

  await client.publishContribution('submission-1', {
    archiveId: null,
    category: 'event',
    visibility: 'public',
  });

  assert.equal(calls[0].args.p_code, null);
  assert.equal(calls[0].args.p_business_code, null);
  assert.equal(calls[0].args.p_version, '0.1');
});

test('administrator archive client queries every visibility state and deletes a selected archive', async () => {
  const calls = [];
  const supabase = {
    from(table) {
      const call = { table, filters: [] };
      calls.push(call);
      const query = {
        select(columns) {
          call.columns = columns;
          return query;
        },
        delete() {
          call.operation = 'delete';
          return query;
        },
        eq(column, value) {
          call.filters.push([column, value]);
          return query;
        },
        or(filter) {
          call.or = filter;
          return query;
        },
        order(column, options) {
          call.order = { column, options };
          return query;
        },
        limit(value) {
          call.limit = value;
          return Promise.resolve({ data: [], error: null });
        },
        single() {
          return Promise.resolve({ data: { id: 'archive-01', code: 'TEST-01', title: '测试档案' }, error: null });
        },
      };
      return query;
    },
    rpc: () => { throw new Error('not used'); },
    functions: { invoke: () => { throw new Error('not used'); } },
  };
  const client = createArchiveWorkflowClient(supabase);

  await client.listAdminArchives({ query: 'TEST-01' });
  await client.deleteArchive('archive-01');

  assert.equal(calls[0].table, 'archives');
  assert.equal(calls[0].operation, undefined);
  assert.equal(calls[0].or, 'code.ilike.%TEST-01%,title.ilike.%TEST-01%');
  assert.equal(calls[0].limit, 100);
  assert.equal(calls[1].operation, 'delete');
  assert.deepEqual(calls[1].filters, [['id', 'archive-01']]);
});

test('workspace note client emits ordered shared-content requests with whitelisted writes', async () => {
  const calls = [];
  const rows = {
    workspace_notes: {
      id: 'note-1',
      title: '值班提醒',
      content: '核对索引。',
      sort_order: 2,
      created_by: 'admin-1',
      created_at: '2026-07-29T00:00:00.000Z',
      updated_at: '2026-07-29T00:00:00.000Z',
    },
  };
  const supabase = {
    from(table) {
      const call = { table, filters: [], orders: [] };
      calls.push(call);
      const query = {
        select(columns) {
          call.columns = columns;
          return query;
        },
        insert(payload) {
          call.operation = 'insert';
          call.payload = payload;
          return query;
        },
        update(payload) {
          call.operation = 'update';
          call.payload = payload;
          return query;
        },
        delete() {
          call.operation = 'delete';
          return query;
        },
        eq(column, value) {
          call.filters.push([column, value]);
          return query;
        },
        order(column, options) {
          call.orders.push([column, options]);
          return query;
        },
        single() {
          return Promise.resolve({ data: rows[table], error: null });
        },
        then(resolve) {
          return Promise.resolve({ data: [rows[table]], error: null }).then(resolve);
        },
      };
      return query;
    },
    rpc: () => { throw new Error('not used'); },
    functions: { invoke: () => { throw new Error('not used'); } },
  };
  const client = createArchiveWorkflowClient(supabase);

  await client.listWorkspaceNotes();
  await client.createWorkspaceNote({
    title: '  值班提醒  ',
    content: '  核对索引。  ',
    sortOrder: 2,
    createdBy: 'must-not-leak',
    createdAt: 'must-not-leak',
  });
  await client.updateWorkspaceNote('note-1', {
    title: '  更新提醒 ',
    content: '  完成交接。 ',
    sortOrder: 4,
    createdBy: 'must-not-leak',
  });
  const deleted = await client.deleteWorkspaceNote('note-1');

  assert.deepEqual(calls[0].orders, [
    ['sort_order', { ascending: true }],
    ['created_at', { ascending: true }],
    ['id', { ascending: true }],
  ]);
  assert.deepEqual(calls[1].payload, {
    title: '值班提醒',
    content: '核对索引。',
    sort_order: 2,
  });
  assert.deepEqual(calls[2].payload, {
    title: '更新提醒',
    content: '完成交接。',
    sort_order: 4,
  });
  assert.deepEqual(calls[2].filters, [['id', 'note-1']]);
  assert.deepEqual(calls[3].filters, [['id', 'note-1']]);
  assert.deepEqual(deleted, { id: 'note-1' });
});

test('workspace note client rejects blank text and invalid ordering before querying Supabase', async () => {
  let queryCount = 0;
  const client = createArchiveWorkflowClient({
    from: () => {
      queryCount += 1;
      throw new Error('validation must happen first');
    },
    rpc: () => { throw new Error('not used'); },
    functions: { invoke: () => { throw new Error('not used'); } },
  });
  const invalid = (code) => (error) => error?.code === code;

  assert.throws(
    () => client.createWorkspaceNote({ title: ' ', content: '正文', sortOrder: 0 }),
    invalid('invalid_workspace_note'),
  );
  assert.throws(
    () => client.createWorkspaceNote({ title: '标题', content: '\n', sortOrder: 0 }),
    invalid('invalid_workspace_note'),
  );
  assert.throws(
    () => client.updateWorkspaceNote('note-1', { title: '标题', content: '正文', sortOrder: -1 }),
    invalid('invalid_sort_order'),
  );
  assert.throws(
    () => client.updateWorkspaceNote('note-1', { title: '标题', content: '正文', sortOrder: '2' }),
    invalid('invalid_sort_order'),
  );
  assert.throws(
    () => client.updateWorkspaceNote('note-1', { title: '标题', content: '正文', sortOrder: null }),
    invalid('invalid_sort_order'),
  );
  assert.equal(queryCount, 0);
});

test('workspace note layout client scopes reads and upserts to one profile-note key', async () => {
  const calls = [];
  const layout = {
    note_id: 'note-1',
    profile_id: 'clerk-1',
    left_px: 120,
    top_px: 80,
    updated_at: '2026-07-29T00:00:00.000Z',
  };
  const supabase = {
    from(table) {
      const call = { table, filters: [], orders: [] };
      calls.push(call);
      const query = {
        select(columns) {
          call.columns = columns;
          return query;
        },
        eq(column, value) {
          call.filters.push([column, value]);
          return query;
        },
        order(column, options) {
          call.orders.push([column, options]);
          return query;
        },
        upsert(payload, options) {
          call.operation = 'upsert';
          call.payload = payload;
          call.options = options;
          return query;
        },
        single() {
          return Promise.resolve({ data: layout, error: null });
        },
        then(resolve) {
          return Promise.resolve({ data: [layout], error: null }).then(resolve);
        },
      };
      return query;
    },
    rpc: () => { throw new Error('not used'); },
    functions: { invoke: () => { throw new Error('not used'); } },
  };
  const client = createArchiveWorkflowClient(supabase);

  await client.listWorkspaceNoteLayouts('clerk-1');
  await client.saveWorkspaceNoteLayout({
    noteId: 'note-1',
    profileId: 'clerk-1',
    leftPx: 120,
    topPx: 80,
  });

  assert.deepEqual(calls[0].filters, [['profile_id', 'clerk-1']]);
  assert.deepEqual(calls[0].orders, [['note_id', { ascending: true }]]);
  assert.deepEqual(calls[1].payload, {
    note_id: 'note-1',
    profile_id: 'clerk-1',
    left_px: 120,
    top_px: 80,
  });
  assert.deepEqual(calls[1].options, { onConflict: 'note_id,profile_id' });
});

test('workspace note layout client rejects non-finite fractional and negative coordinates', () => {
  let queryCount = 0;
  const client = createArchiveWorkflowClient({
    from: () => {
      queryCount += 1;
      throw new Error('validation must happen first');
    },
    rpc: () => { throw new Error('not used'); },
    functions: { invoke: () => { throw new Error('not used'); } },
  });
  const invalid = (error) => error?.code === 'invalid_coordinate';

  for (const [leftPx, topPx] of [
    [-1, 0],
    [0.5, 0],
    [0, Number.POSITIVE_INFINITY],
    ['120', 0],
    [0, null],
  ]) {
    assert.throws(
      () => client.saveWorkspaceNoteLayout({ noteId: 'note-1', profileId: 'clerk-1', leftPx, topPx }),
      invalid,
    );
  }
  assert.equal(queryCount, 0);
});

test('client source scopes owner writes and uses optimistic draft revisions', async () => {
  const source = await readFile(repositorySourceUrl, 'utf8');
  assert.match(source, /\.eq\(['"]owner_id['"]/);
  assert.match(source, /\.eq\(['"]revision['"]/);
  assert.match(source, /status:\s*['"]submitted['"]/);
  assert.doesNotMatch(source, /service[_-]?role/i);
  assert.doesNotMatch(source, /VITE_SUPABASE_SERVICE_ROLE_KEY/);
});

test('access gate emits a session event with profile, role, session and preview state', async () => {
  const source = await readFile(authSourceUrl, 'utf8');
  assert.match(source, /palis:session-change/);
  assert.match(source, /detail:\s*\{[\s\S]*session[\s\S]*profile[\s\S]*role[\s\S]*preview/);
  assert.match(source, /from\(['"]profiles['"]\)/);
});
