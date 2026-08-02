import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canCreateArchiveStoryPage,
  canManageArchiveStoryPage,
  renderArchiveStoryMenu,
  storyPageLabel,
  validateArchiveStoryBody,
  validateArchiveStoryTitle,
} from '../src/archive-workflow/story-pages.js';

test('story pages use editable titles with numbered defaults instead of body previews', () => {
  assert.equal(storyPageLabel(0), '留言 01');
  assert.equal(storyPageLabel(8), '留言 09');
  assert.equal(storyPageLabel(99), '留言 100');

  const markup = renderArchiveStoryMenu([
    { id: 'page-a', title: '归航后的夜谈', body: '不应出现在菜单里的正文' },
    { id: 'page-b', title: '<img src=x onerror=alert(1)>', body: '另一段正文' },
  ], { canCreate: true });

  assert.match(markup, /归航后的夜谈/);
  assert.match(markup, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(markup, /data-archive-story-page="page-a"/);
  assert.match(markup, /data-archive-story-action="create"/);
  assert.doesNotMatch(markup, /不应出现在菜单里的正文/);
  assert.doesNotMatch(markup, /<img/);
});

test('story page body is plain text, required, and limited to 4000 characters', () => {
  assert.deepEqual(validateArchiveStoryBody('  一段日后谈  '), { value: '一段日后谈' });
  assert.deepEqual(validateArchiveStoryBody('   '), { error: '留言内容不能为空' });
  assert.deepEqual(validateArchiveStoryBody('x'.repeat(4001)), { error: '留言不能超过 4000 字' });
});

test('story page title is required, editable, and limited to 60 characters', () => {
  assert.deepEqual(validateArchiveStoryTitle('  归航后的夜谈  '), { value: '归航后的夜谈' });
  assert.deepEqual(validateArchiveStoryTitle('   '), { error: '留言标题不能为空' });
  assert.deepEqual(validateArchiveStoryTitle('x'.repeat(61)), { error: '留言标题不能超过 60 字' });
});

test('signed-in observer, clerk, and admin may create while only author or admin may manage', () => {
  for (const role of ['observer', 'clerk', 'admin']) {
    assert.equal(canCreateArchiveStoryPage({ profileId: `${role}-1`, role }), true);
  }
  assert.equal(canCreateArchiveStoryPage({ profileId: null, role: 'observer' }), false);
  assert.equal(canCreateArchiveStoryPage({ profileId: null, role: 'visitor' }), false);

  const page = { author_id: 'observer-1' };
  assert.equal(canManageArchiveStoryPage(page, { profileId: 'observer-1', role: 'observer' }), true);
  assert.equal(canManageArchiveStoryPage(page, { profileId: 'observer-2', role: 'observer' }), false);
  assert.equal(canManageArchiveStoryPage(page, { profileId: 'admin-1', role: 'admin' }), true);
});
