import test from 'node:test';
import assert from 'node:assert/strict';

import { createSupabaseArchiveWorkflowRepository } from '../src/archive-workflow/repositories/supabase-repository.js';
import { defineArchiveWorkflowRepositoryConformance } from './helpers/archive-workflow-repository-conformance.mjs';

test('Supabase archive repository requires a configured Supabase client', () => {
  assert.throws(
    () => createSupabaseArchiveWorkflowRepository({ from() {} }),
    /configured Supabase client/,
  );
});

test('mainline subscription listens only to shared mainline state and tears down its channel', async () => {
  const watched = [];
  let removed = null;
  let subscribed = false;
  const channel = {
    on(kind, filter, listener) { watched.push({ kind, table: filter.table, listener }); return channel; },
    subscribe() { subscribed = true; return channel; },
  };
  const repository = createSupabaseArchiveWorkflowRepository({
    from: () => { throw new Error('not used'); },
    rpc: () => { throw new Error('not used'); },
    functions: { invoke: () => { throw new Error('not used'); } },
    channel: () => channel,
    removeChannel: async (value) => { removed = value; },
  });

  let received = 0;
  const unsubscribe = repository.subscribeMainlineChanges(() => { received += 1; });
  assert.equal(subscribed, true);
  assert.deepEqual(watched.map(({ table }) => table), [
    'mainline_versions', 'mainline_staff_slots', 'archive_contributions',
  ]);
  watched[0].listener({ new: { code: '0.1' } });
  watched[2].listener({ new: { draft_content: { mainline: { stage: 1 } } } });
  watched[2].listener({ new: { draft_content: {} } });
  assert.equal(received, 2);
  unsubscribe();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(removed, channel);
});

test('searching an original business code finds its renumbered server archive', async () => {
  const legacyArchive = {
    id: 'country-9',
    code: 'N21',
    business_code: 'N09',
    category: 'country',
    title: '日本',
    summary: '',
    visibility: 'public',
    origin: 'official',
    is_mother: false,
    is_archived: false,
    published_at: '2026-07-30T00:00:00.000Z',
    sequence_number: 21,
    abbreviation: 'REG',
  };
  const filters = [];
  const request = {
    select() { return request; },
    eq(column, value) { filters.push([column, value]); return request; },
    order() { return request; },
    limit() { return request; },
    or(expression) {
      return Promise.resolve({
        data: expression.includes('business_code.ilike') ? [legacyArchive] : [],
        error: null,
      });
    },
  };
  const repository = createSupabaseArchiveWorkflowRepository({
    from: (table) => {
      assert.equal(table, 'archives');
      return request;
    },
    rpc: () => { throw new Error('not used'); },
    functions: { invoke: () => { throw new Error('not used'); } },
  });

  const archives = await repository.searchArchives('N09');

  assert.deepEqual(archives, [legacyArchive]);
  assert.deepEqual(filters, [], 'reference search must not hide non-public archives before permissions are applied');
});

test('Supabase archive repository calls the public contribution RPC with the archive id', async () => {
  const calls = [];
  const repository = createSupabaseArchiveWorkflowRepository({
    from: () => { throw new Error('not used'); },
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: [], error: null };
    },
    functions: { invoke: () => { throw new Error('not used'); } },
  });

  await repository.listArchiveContributions('archive-1');

  assert.deepEqual(calls, [{
    name: 'list_public_archive_contributions',
    args: { p_archive_id: 'archive-1' },
  }]);
});

test('Supabase archive document choices come from the sanitized document RPC', async () => {
  const calls = [];
  const repository = createSupabaseArchiveWorkflowRepository({
    from: () => { throw new Error('document choices must not bypass the RPC'); },
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: [], error: null };
    },
    functions: { invoke: () => { throw new Error('not used'); } },
  });

  await repository.listArchiveDocuments('archive-1');

  assert.deepEqual(calls, [{
    name: 'list_archive_documents',
    args: { p_archive_id: 'archive-1' },
  }]);
});

test('Supabase editor source reader sends the exact selected document and version to the secure RPC', async () => {
  const calls = [];
  const repository = createSupabaseArchiveWorkflowRepository({
    from: () => { throw new Error('editor source must not bypass the RPC'); },
    rpc: async (name, args) => {
      calls.push({ name, args });
      return {
        data: {
          archiveId: 'archive-1',
          contributionId: 'document-a',
          versionId: 'version-a2',
          sourceKind: 'document',
          content: {
            schemaVersion: 2,
            templateCode: '07',
            values: { hero: 'Document A base' },
          },
          archive: {
            id: 'archive-1',
            code: 'EV27',
            category: 'event',
            title: 'Archive',
            visibility: 'public',
            sequence_number: 27,
            abbreviation: 'RLL',
          },
          references: [],
          mediaContributionId: 'document-a',
          version: {
            id: 'version-a2',
            version_label: '0.2',
            content: { schemaVersion: 2 },
            approved_at: '2026-07-28T00:00:00.000Z',
            created_at: '2026-07-28T00:00:00.000Z',
            submitter: { id: 'clerk-1', display_name: 'Archive Clerk' },
            modifier: null,
            reviewer: null,
          },
        },
        error: null,
      };
    },
    functions: { invoke: () => { throw new Error('not used'); } },
  });

  const source = await repository.loadArchiveEditorSource('archive-1', {
    contributionId: 'document-a',
    versionId: 'version-a2',
  });

  assert.equal(source.content.values.hero, 'Document A base');
  assert.deepEqual(calls, [{
    name: 'load_archive_editor_source',
    args: {
      p_archive_id: 'archive-1',
      p_contribution_id: 'document-a',
      p_version_id: 'version-a2',
      p_official_base: false,
    },
  }]);
});

test('Supabase editor source reader converts an official-static RPC response to nonblank v2 content', async () => {
  const repository = createSupabaseArchiveWorkflowRepository({
    from: () => { throw new Error('editor source must not bypass the RPC'); },
    rpc: async () => ({
      data: {
        archiveId: 'archive-1',
        contributionId: null,
        versionId: null,
        sourceKind: 'official-static',
        content: null,
        archive: {
          id: 'archive-1',
          code: 'SU-VOS',
          category: 'station',
          title: '东方科考站',
          visibility: 'public',
          sequence_number: 5,
          abbreviation: 'LOG',
          index_payload: { owner: 'PALIS' },
        },
        references: [],
        mediaContributionId: null,
        version: null,
      },
      error: null,
    }),
    functions: { invoke: () => { throw new Error('not used'); } },
  });

  const source = await repository.loadArchiveEditorSource('archive-1', {
    officialBase: true,
  });

  assert.equal(source.sourceKind, 'official-static');
  assert.equal(source.content.schemaVersion, 2);
  assert.equal(source.content.values.hero, '东方科考站');
  assert.match(source.content.values['legacy:official-body'], /东方站/);
});

test('Supabase review media reads the selected contribution without requiring publication', async () => {
  const filters = [];
  const signedBatches = [];
  const request = {
    select() { return request; },
    eq(column, value) {
      filters.push([column, value]);
      return request;
    },
    order() {
      return Promise.resolve({
        data: [{
          id: 'attachment-1',
          role: 'event-cover',
          storage_path: 'clerk-1/submission-1/cover.webp',
          alt_text: '待审封面',
          caption: '审核材料',
          sort_order: 0,
        }],
        error: null,
      });
    },
  };
  const repository = createSupabaseArchiveWorkflowRepository({
    from: (table) => {
      assert.equal(table, 'archive_attachments');
      return request;
    },
    rpc: () => { throw new Error('not used'); },
    functions: { invoke: () => { throw new Error('not used'); } },
    storage: {
      from: (bucket) => ({
        createSignedUrls: async (paths) => {
          signedBatches.push(paths);
          return {
            data: paths.map((path) => ({
              signedUrl: `https://signed.test/${bucket}/${path}`,
            })),
            error: null,
          };
        },
      }),
    },
  });

  const media = await repository.listContributionMedia('submission-1');

  assert.deepEqual(filters, [['contribution_id', 'submission-1']]);
  assert.deepEqual(signedBatches, [['clerk-1/submission-1/cover.webp']]);
  assert.equal(media[0].role, 'event-cover');
  assert.match(media[0].publicUrl, /^https:\/\/signed\.test\//);
});

test('Supabase role-based media rejects non-WebP and files above 800KB before storage', async () => {
  let storageCalls = 0;
  const repository = createSupabaseArchiveWorkflowRepository({
    from: () => { throw new Error('not used'); },
    rpc: () => { throw new Error('not used'); },
    functions: { invoke: () => { throw new Error('not used'); } },
    storage: {
      from: () => {
        storageCalls += 1;
        return {};
      },
    },
  });

  await assert.rejects(
    repository.uploadAttachment(
      'submission-1',
      'clerk-1',
      new File(['abc'], 'cover.png', { type: 'image/png' }),
      { role: 'event-cover' },
    ),
    (error) => error?.code === 'invalid_media_file',
  );
  await assert.rejects(
    repository.uploadAttachment(
      'submission-1',
      'clerk-1',
      new File([new Uint8Array(800 * 1024 + 1)], 'cover.webp', { type: 'image/webp' }),
      { role: 'event-cover' },
    ),
    (error) => error?.code === 'invalid_media_file',
  );
  assert.equal(storageCalls, 0);
});

test('Supabase attachment registration failure removes the uploaded storage object', async () => {
  const removed = [];
  const insertRequest = {
    insert() { return insertRequest; },
    select() { return insertRequest; },
    single: async () => ({
      data: null,
      error: { code: '23514', message: 'slot limit exceeded' },
    }),
  };
  const repository = createSupabaseArchiveWorkflowRepository({
    from: (table) => {
      assert.equal(table, 'archive_attachments');
      return insertRequest;
    },
    rpc: () => { throw new Error('not used'); },
    functions: { invoke: () => { throw new Error('not used'); } },
    storage: {
      from: (bucket) => ({
        upload: async (path) => ({ data: { path }, error: null }),
        remove: async (paths) => {
          removed.push({ bucket, paths });
          return { data: paths, error: null };
        },
      }),
    },
  });

  await assert.rejects(
    repository.uploadAttachment(
      'submission-1',
      'clerk-1',
      new File(['abc'], 'cover.webp', { type: 'image/webp' }),
      { role: 'event-cover' },
    ),
    /register attachment/i,
  );
  assert.equal(removed.length, 1);
  assert.equal(removed[0].bucket, 'archive-attachments');
  assert.equal(removed[0].paths.length, 1);
});

test('Supabase media upload uses an ASCII-only storage object name while preserving the display name', async () => {
  let uploadedPath = '';
  let insertedPayload = null;
  const insertRequest = {
    insert(payload) { insertedPayload = payload; return insertRequest; },
    select() { return insertRequest; },
    single: async () => ({ data: { id: 'attachment-1' }, error: null }),
  };
  const repository = createSupabaseArchiveWorkflowRepository({
    from: (table) => {
      assert.equal(table, 'archive_attachments');
      return insertRequest;
    },
    rpc: () => { throw new Error('not used'); },
    functions: { invoke: () => { throw new Error('not used'); } },
    storage: {
      from: () => ({
        upload: async (path) => {
          uploadedPath = path;
          return { data: { path }, error: null };
        },
      }),
    },
  });

  await repository.uploadAttachment(
    'submission-1',
    'clerk-1',
    new File(['abc'], 'Camera012_成图_351442394-00.webp', { type: 'image/webp' }),
    { role: 'species-cover' },
  );

  assert.match(uploadedPath, /^clerk-1\/submission-1\/[a-z0-9-]+\.webp$/i);
  assert.doesNotMatch(uploadedPath, /[\u4e00-\u9fff]/);
  assert.equal(insertedPayload.file_name, 'Camera012_成图_351442394-00.webp');
});

test('Supabase publication leaves formal numbering to the database and returns its identity', async () => {
  const calls = [];
  const repository = createSupabaseArchiveWorkflowRepository({
    from: () => { throw new Error('not used'); },
    rpc: async (name, args) => {
      calls.push({ name, args });
      return {
        data: {
          archiveId: 'archive-27',
          versionId: 'version-1',
          status: 'published',
          code: 'EV27',
          sequenceNumber: 27,
          abbreviation: 'RLL',
          formalNumber: '027.RLL',
          versionLabel: '0.1',
        },
        error: null,
      };
    },
    functions: { invoke: () => { throw new Error('not used'); } },
  });

  const result = await repository.publishContribution('contribution-1', {
    archiveId: null,
    code: 'HZ-6',
    category: 'event',
    visibility: 'public',
    marks: [],
  });

  assert.equal(calls[0].name, 'publish_archive_contribution');
  assert.equal(calls[0].args.p_code, null);
  assert.equal(result.code, 'EV27');
  assert.equal(result.formalNumber, '027.RLL');
});

test('Supabase publication explains when the transactional repair migration is missing', async () => {
  const repository = createSupabaseArchiveWorkflowRepository({
    from: () => { throw new Error('not used'); },
    rpc: async () => ({
      data: null,
      error: { code: '22023', message: 'archive code and category are required' },
    }),
    functions: { invoke: () => { throw new Error('not used'); } },
  });

  await assert.rejects(
    repository.publishContribution('contribution-1', {
      category: 'event',
      visibility: 'public',
      marks: [],
    }),
    (error) => error?.code === 'schema_update_required',
  );
});

test('published archive pages use bounded offset ranges', async () => {
  const ranges = [];
  const request = {
    select() { return request; },
    eq() { return request; },
    order() { return request; },
    range(from, to) {
      ranges.push([from, to]);
      return Promise.resolve({ data: [], error: null });
    },
  };
  const repository = createSupabaseArchiveWorkflowRepository({
    from: (table) => {
      assert.equal(table, 'archives');
      return request;
    },
    rpc: () => { throw new Error('not used'); },
    functions: { invoke: () => { throw new Error('not used'); } },
  });

  await repository.listPublishedArchives({ limit: 25, offset: 50 });

  assert.deepEqual(ranges, [[50, 74]]);
});

test('published archive pages batch-sign only person portraits and event covers', async () => {
  const filterCalls = [];
  const archiveRequest = {
    select() { return archiveRequest; },
    eq() { return archiveRequest; },
    order() { return archiveRequest; },
    range() {
      return Promise.resolve({
        data: [
          { id: 'event-1', category: 'event', visibility: 'public' },
          { id: 'person-1', category: 'person', visibility: 'public' },
          { id: 'species-1', category: 'species', visibility: 'public' },
        ],
        error: null,
      });
    },
  };
  const mediaRows = [
    {
      id: 'cover-1',
      role: 'event-cover',
      storage_path: 'event-cover.webp',
      sort_order: 0,
      contribution: {
        archive_id: 'event-1',
        status: 'published',
        created_at: '2026-07-29T00:00:00Z',
      },
    },
    {
      id: 'portrait-1',
      role: 'portrait',
      storage_path: 'portrait.webp',
      sort_order: 0,
      contribution: {
        archive_id: 'person-1',
        status: 'published',
        created_at: '2026-07-29T00:00:00Z',
      },
    },
  ];
  const attachmentRequest = {
    select() { return attachmentRequest; },
    in(column, values) {
      filterCalls.push(['in', column, values]);
      return attachmentRequest;
    },
    eq(column, value) {
      filterCalls.push(['eq', column, value]);
      return attachmentRequest;
    },
    order() { return attachmentRequest; },
    then(resolve) {
      return Promise.resolve({ data: mediaRows, error: null }).then(resolve);
    },
  };
  const signedBatches = [];
  const repository = createSupabaseArchiveWorkflowRepository({
    from: (table) => table === 'archives' ? archiveRequest : attachmentRequest,
    rpc: () => { throw new Error('not used'); },
    functions: { invoke: () => { throw new Error('not used'); } },
    storage: {
      from: () => ({
        createSignedUrls: async (paths) => {
          signedBatches.push(paths);
          return {
            data: paths.map((path) => ({ signedUrl: `https://signed.test/${path}` })),
            error: null,
          };
        },
      }),
    },
  });

  const archives = await repository.listPublishedArchives();

  assert.deepEqual(signedBatches, [['event-cover.webp', 'portrait.webp']]);
  assert.equal(archives.find(({ id }) => id === 'event-1').cover_url, 'https://signed.test/event-cover.webp');
  assert.equal(archives.find(({ id }) => id === 'person-1').cover_url, 'https://signed.test/portrait.webp');
  assert.equal(Object.hasOwn(archives.find(({ id }) => id === 'species-1'), 'cover_url'), false);
  assert.ok(filterCalls.some(([kind, column, values]) =>
    kind === 'in'
    && column === 'role'
    && values.join(',') === 'portrait,event-cover'));
});

const clone = (value) => structuredClone(value);

const createSupabaseHarness = async () => {
  const state = { profiles: [], contributions: [], archives: [], versions: [] };
  let principal = null;
  let sequence = 0;

  const contributionForRead = (contribution, includeRelations = false) => {
    const result = clone(contribution);
    if (includeRelations) {
      const owner = state.profiles.find((profile) => profile.id === contribution.owner_id);
      result.owner = owner ? { id: owner.id, email: owner.email, display_name: owner.display_name } : null;
      result.archive = contribution.archive_id
        ? clone(state.archives.find((archive) => archive.id === contribution.archive_id) || null)
        : null;
    }
    return result;
  };

  const matches = (row, filters) => filters.every(({ kind, column, value, values }) => {
    if (kind === 'eq') return row[column] === value;
    if (kind === 'in') return values.includes(row[column]);
    if (kind === 'neq') return row[column] !== value;
    if (kind === 'not-null') return row[column] !== null && row[column] !== undefined;
    return true;
  });

  const execute = async (query) => {
    const stateKey = query.table === 'archive_contributions' ? 'contributions' : query.table;
    const rows = state[stateKey] || [];
    const selected = rows.filter((row) => matches(row, query.filters));
    if (query.operation === 'insert') {
      const id = `${query.table}-${++sequence}`;
      const row = {
        id,
        ...clone(query.payload),
        revision: 1,
        updated_at: '2026-07-28T00:00:00.000Z',
      };
      rows.push(row);
      return { data: clone(row), error: null };
    }
    if (query.operation === 'update') {
      for (const row of selected) Object.assign(row, clone(query.payload), { updated_at: '2026-07-28T00:00:00.000Z' });
      const data = selected[0] ? contributionForRead(selected[0]) : null;
      return { data: clone(data), error: null };
    }
    if (query.operation === 'delete') {
      const row = selected[0] || null;
      if (row) state[stateKey] = rows.filter((candidate) => candidate !== row);
      return { data: row ? clone(row) : null, error: null };
    }
    const includeRelations = query.table === 'archive_contributions' && query.selection.includes('owner:profiles');
    const data = selected.map((row) => contributionForRead(row, includeRelations));
    return { data: query.mode === 'single' || query.mode === 'maybeSingle' ? (data[0] || null) : clone(data), error: null };
  };

  const from = (table) => {
    const query = { table, operation: 'select', payload: null, filters: [], selection: '', mode: 'many' };
    const builder = {
      select(selection) { query.selection = selection; return builder; },
      insert(payload) { query.operation = 'insert'; query.payload = payload; return builder; },
      update(payload) { query.operation = 'update'; query.payload = payload; return builder; },
      delete() { query.operation = 'delete'; return builder; },
      eq(column, value) { query.filters.push({ kind: 'eq', column, value }); return builder; },
      neq(column, value) { query.filters.push({ kind: 'neq', column, value }); return builder; },
      in(column, values) { query.filters.push({ kind: 'in', column, values }); return builder; },
      not(column, operator, value) {
        if (operator === 'is' && value === null) query.filters.push({ kind: 'not-null', column });
        return builder;
      },
      order() { return builder; },
      limit() { return builder; },
      range(from, to) {
        query.range = [from, to];
        return execute(query);
      },
      or() { return builder; },
      single() { query.mode = 'single'; return execute(query); },
      maybeSingle() { query.mode = 'maybeSingle'; return execute(query); },
      then(resolve, reject) { return execute(query).then(resolve, reject); },
    };
    return builder;
  };

  const rpc = async (name, args) => {
    if (name === 'review_archive_submission') {
      const contribution = state.contributions.find((candidate) => candidate.id === args.p_contribution_id);
      contribution.status = args.p_decision;
      return { data: contributionForRead(contribution), error: null };
    }
    if (name === 'publish_archive_contribution') {
      const contribution = state.contributions.find((candidate) => candidate.id === args.p_contribution_id);
      const sequenceNumber = 27 + state.archives.length;
      const archive = {
        id: args.p_archive_id || `archive-${++sequence}`,
        code: `EV${sequenceNumber}`,
        business_code: args.p_business_code,
        category: args.p_category,
        title: contribution.title,
        visibility: args.p_visibility,
        sequence_number: sequenceNumber,
        abbreviation: 'RLL',
        index_payload: contribution.draft_content.indexData || {},
        new_badge_visible: !args.p_archive_id,
        published_at: '2026-07-28T00:00:00.000Z',
      };
      state.archives.push(archive);
      contribution.archive_id = archive.id;
      contribution.status = 'published';
      const owner = state.profiles.find((profile) => profile.id === contribution.owner_id);
      const version = {
        id: `version-${++sequence}`,
        version_label: args.p_version,
        content: clone(contribution.draft_content),
        approved_at: '2026-07-28T00:00:00.000Z',
        created_at: '2026-07-28T00:00:00.000Z',
        submitter: { id: owner.id, display_name: owner.display_name },
        modifier: null,
        reviewer: principal ? { id: principal.id, display_name: principal.id } : null,
      };
      state.versions.push({ archive_id: archive.id, contribution_id: contribution.id, ...version });
      return {
        data: {
          archiveId: archive.id,
          versionId: version.id,
          status: 'published',
          code: archive.code,
          sequenceNumber,
          abbreviation: 'RLL',
          formalNumber: `${String(sequenceNumber).padStart(3, '0')}.RLL`,
          versionLabel: version.version_label,
        },
        error: null,
      };
    }
    if (name === 'list_public_archive_contributions') {
      const data = state.contributions.filter((contribution) => contribution.archive_id === args.p_archive_id).map((contribution) => {
        const owner = state.profiles.find((profile) => profile.id === contribution.owner_id);
        return {
          id: contribution.id,
          archive_id: contribution.archive_id,
          target_contribution_id: contribution.target_contribution_id,
          title: contribution.title,
          kind: contribution.kind,
          status: contribution.status,
          created_at: contribution.updated_at,
          owner: { id: owner.id, display_name: owner.display_name },
          versions: state.versions.filter((version) => version.contribution_id === contribution.id).map((version) => clone(version)),
        };
      });
      return { data: clone(data), error: null };
    }
    return { data: [], error: null };
  };

  return {
    repository: createSupabaseArchiveWorkflowRepository({
      from,
      rpc,
      functions: { invoke: async () => ({ data: { users: [] }, error: null }) },
    }),
    async seed(fixture) {
      state.profiles = [fixture.clerk, fixture.administrator].map((profile) => ({
        id: profile.id,
        email: `${profile.id}@example.com`,
        display_name: profile.id,
        role: profile.role,
        enabled: true,
      }));
    },
    async inspectState() { return clone(state); },
    async setPrincipal(nextPrincipal) { principal = clone(nextPrincipal); },
  };
};

defineArchiveWorkflowRepositoryConformance('Supabase archive repository', createSupabaseHarness);
