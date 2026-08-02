import assert from 'node:assert/strict';
import test from 'node:test';

import { createEmptyLocalState } from '../src/archive-workflow/local/local-state.js';
import { createLocalWorkflowHarness, LOCAL_PROFILES } from './helpers/local-workflow-harness.mjs';

const hasCode = (code) => (error) => error?.code === code;

const OBSERVER = {
  id: 'observer-1', email: 'observer@example.com', display_name: '观察员一号', role: 'observer', enabled: true,
};
const OTHER_OBSERVER = {
  id: 'observer-2', email: 'other@example.com', display_name: '观察员二号', role: 'observer', enabled: true,
};

test('archive story pages publish immediately, remain author-editable, and notify administrators', async () => {
  const harness = await createLocalWorkflowHarness({ principal: OBSERVER });
  const state = createEmptyLocalState();
  state.profiles.push(...structuredClone(LOCAL_PROFILES), OBSERVER, OTHER_OBSERVER);
  state.archives.push({
    id: 'archive-1', code: 'S01', category: 'species', title: '黑针木',
    visibility: 'public', sequence_number: 1, abbreviation: 'SPC',
  });
  await harness.seed(state);

  const created = await harness.repository.createArchiveStoryPage('archive-1', { title: '归航后的夜谈', body: '第一次记录。' });
  assert.equal(created.title, '归航后的夜谈');
  assert.equal(created.body, '第一次记录。');
  assert.equal(created.author_id, OBSERVER.id);
  assert.equal(created.author_name, OBSERVER.display_name);
  assert.equal((await harness.repository.listArchiveStoryPages('archive-1')).length, 1);

  const afterCreate = await harness.inspectState();
  const adminNotice = afterCreate.notifications.find((entry) => entry.recipient_id === LOCAL_PROFILES[0].id);
  assert.match(adminNotice.subject, /新增留言/);
  assert.match(adminNotice.message, /S01/);

  const updated = await harness.repository.updateArchiveStoryPage(created.id, { title: '第二次夜谈', body: '修改后的记录。' });
  assert.equal(updated.title, '第二次夜谈');
  assert.equal(updated.body, '修改后的记录。');

  await harness.setPrincipal(OTHER_OBSERVER);
  await assert.rejects(
    () => harness.repository.updateArchiveStoryPage(created.id, { title: '越权修改', body: '他人修改。' }),
    hasCode('permission_denied'),
  );
  await assert.rejects(
    () => harness.repository.deleteArchiveStoryPage(created.id),
    hasCode('permission_denied'),
  );

  await harness.setPrincipal(LOCAL_PROFILES[0]);
  const adminUpdated = await harness.repository.updateArchiveStoryPage(created.id, { title: '管理员修订', body: '管理员修订。' });
  assert.equal(adminUpdated.body, '管理员修订。');
  assert.deepEqual(await harness.repository.deleteArchiveStoryPage(created.id), { id: created.id });
  assert.deepEqual(await harness.repository.listArchiveStoryPages('archive-1'), []);
});

test('archive story pages reject blank and oversized bodies', async () => {
  const harness = await createLocalWorkflowHarness({ principal: OBSERVER });
  const state = createEmptyLocalState();
  state.profiles.push(...structuredClone(LOCAL_PROFILES), OBSERVER);
  state.archives.push({
    id: 'archive-1', code: 'S01', category: 'species', title: '黑针木',
    visibility: 'public', sequence_number: 1, abbreviation: 'SPC',
  });
  await harness.seed(state);

  await assert.rejects(
    () => harness.repository.createArchiveStoryPage('archive-1', { title: '空正文', body: '   ' }),
    hasCode('invalid_input'),
  );
  await assert.rejects(
    () => harness.repository.createArchiveStoryPage('archive-1', { title: '超长正文', body: 'x'.repeat(4001) }),
    hasCode('invalid_input'),
  );
});
