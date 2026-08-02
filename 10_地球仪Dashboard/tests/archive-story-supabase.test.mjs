import assert from 'node:assert/strict';
import test from 'node:test';

import { createSupabaseArchiveWorkflowRepository } from '../src/archive-workflow/repositories/supabase-repository.js';

const page = {
  id: 'story-1', archive_id: 'archive-1', author_id: 'observer-1', author_name: '观察员一号',
  title: '归航后的夜谈', body: '日后谈。', created_at: '2026-08-02T00:00:00.000Z', updated_at: '2026-08-02T00:00:00.000Z',
};

test('Supabase story page methods use the shared archive_story_pages table', async () => {
  const calls = [];
  const makeRequest = (table) => {
    const request = {
      select(value = '*') { calls.push(['select', table, value]); return request; },
      eq(column, value) { calls.push(['eq', column, value]); return request; },
      order(column, options) {
        calls.push(['order', column, options]);
        if (column === 'id') return Promise.resolve({ data: [page], error: null });
        return request;
      },
      insert(payload) { calls.push(['insert', table, payload]); return request; },
      update(payload) { calls.push(['update', table, payload]); return request; },
      delete() { calls.push(['delete', table]); return request; },
      single() {
        const data = calls.at(-3)?.[0] === 'delete' ? { id: page.id } : page;
        return Promise.resolve({ data, error: null });
      },
    };
    return request;
  };
  const repository = createSupabaseArchiveWorkflowRepository({
    from: makeRequest,
    rpc: () => { throw new Error('not used'); },
    functions: { invoke: () => { throw new Error('not used'); } },
  });

  assert.deepEqual(await repository.listArchiveStoryPages('archive-1'), [page]);
  assert.equal((await repository.createArchiveStoryPage('archive-1', { title: '归航后的夜谈', body: '日后谈。' })).id, page.id);
  assert.equal((await repository.updateArchiveStoryPage(page.id, { title: '修订标题', body: '修订。' })).id, page.id);
  assert.equal((await repository.deleteArchiveStoryPage(page.id)).id, page.id);

  assert.ok(calls.some((entry) => entry[0] === 'insert' && entry[1] === 'archive_story_pages'));
  assert.ok(calls.some((entry) => entry[0] === 'update' && entry[1] === 'archive_story_pages'));
  assert.ok(calls.some((entry) => entry[0] === 'delete' && entry[1] === 'archive_story_pages'));
});
