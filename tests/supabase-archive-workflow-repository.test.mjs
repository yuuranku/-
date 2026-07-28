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
