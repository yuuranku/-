import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createArchiveWorkflowClient } from '../src/archive-workflow/client.js';

const projectRoot = new URL('../', import.meta.url);
const clientSourceUrl = new URL('src/archive-workflow/client.js', projectRoot);
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
  for (const method of [
    'getProfile',
    'listTemplates',
    'listMyDrafts',
    'saveDraft',
    'submitDraft',
    'listReviewQueue',
    'reviewSubmission',
    'publishContribution',
    'inviteUser',
    'listUsers',
    'createUser',
    'updateUserRole',
    'resetUserPassword',
    'deleteUser',
    'listNotifications',
    'markNotificationRead',
    'searchArchives',
    'listEditableArchives',
    'loadArchiveEditorSource',
    'listArchiveContributions',
    'listArchiveReferences',
    'uploadAttachment',
  ]) {
    assert.equal(typeof client[method], 'function', `${method} should be exported`);
  }
});

test('workflow client enforces the repository contract when it constructs its public API', async () => {
  const source = await readFile(clientSourceUrl, 'utf8');

  assert.match(source, /import\s+\{\s*assertArchiveWorkflowRepository\s*\}\s+from\s+['"]\.\/repository-contract\.js['"]/);
  assert.match(source, /return\s+assertArchiveWorkflowRepository\(\{[\s\S]*uploadAttachment,[\s\S]*\}\);/);
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
  assert.equal(calls[2].name, 'admin-invite-user');
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

test('client source scopes owner writes and uses optimistic draft revisions', async () => {
  const source = await readFile(clientSourceUrl, 'utf8');
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
