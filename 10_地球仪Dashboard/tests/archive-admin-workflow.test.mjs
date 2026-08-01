import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const projectRoot = new URL('../', import.meta.url);
const [workspace, repository, migration, userFunction, html] = await Promise.all([
  readFile(new URL('src/archive-workflow/workspace.js', projectRoot), 'utf8'),
  readFile(new URL('src/archive-workflow/repositories/supabase-repository.js', projectRoot), 'utf8'),
  readFile(new URL('supabase/migrations/202607270001_archive_workflow.sql', projectRoot), 'utf8'),
  readFile(new URL('supabase/functions/admin-manage-user/index.ts', projectRoot), 'utf8'),
  readFile(new URL('index.html', projectRoot), 'utf8'),
]);

test('administrator directly creates and manages clerk or observer accounts', () => {
  assert.match(workspace, /data-admin-user-management/);
  assert.match(workspace, /type="password"/);
  assert.match(workspace, /data-admin-user-list/);
  assert.match(workspace, /重置密码/);
  assert.match(workspace, /删除账号|停用账号/);
  assert.match(workspace, /value="clerk"/);
  assert.match(workspace, /value="observer"/);
  const userPanel = workspace.slice(workspace.indexOf('data-admin-user-management'));
  assert.doesNotMatch(userPanel.slice(0, userPanel.indexOf('</form>')), /value="admin"/);
  assert.match(repository, /admin-manage-user/);
  assert.match(repository, /createUser/);
  assert.match(repository, /updateUserRole/);
  assert.match(repository, /resetUserPassword/);
  assert.match(repository, /deleteUser/);
  assert.match(userFunction, /auth\.admin\.createUser/);
  assert.match(userFunction, /auth\.admin\.updateUserById/);
  assert.match(userFunction, /auth\.admin\.listUsers/);
  assert.match(userFunction, /717652849@qq\.com/);
  assert.match(userFunction, /已设置（不可查看）/);
  assert.doesNotMatch(userFunction, /plaintext_password|password_plaintext/i);
});

test('review pane requires a written reply before approval or return', () => {
  assert.match(workspace, /data-review-queue/);
  assert.match(workspace, /data-review-message[^>]+required/);
  assert.match(workspace, /data-review-decision="approved"/);
  assert.match(workspace, /data-review-decision="changes_requested"/);
  assert.match(workspace, /reviewSubmission/);
  assert.match(repository, /Review reply is required/);
});

test('approved submissions can be formally registered with archive marks', () => {
  assert.match(workspace, /data-registration-form/);
  assert.match(workspace, /name="mother"/);
  assert.match(workspace, /name="archival"/);
  assert.match(workspace, /value="public"/);
  assert.match(workspace, /value="sealed"/);
  assert.match(workspace, /value="offline"/);
  assert.match(workspace, /引用复核/);
  assert.match(workspace, /publishContribution/);
  assert.match(workspace, /正式档号由系统自动分配/);
  assert.doesNotMatch(workspace, /既有档案 ID/);
});

test('database publication flags dependent references for re-review', () => {
  assert.match(migration, /set needs_review = true/i);
  assert.match(migration, /reference_review_required = true/i);
  assert.match(migration, /mother_version_id/i);
  assert.match(migration, /is_archived/i);
});

test('administrator workspace exposes an archive manager with typed-code permanent deletion', () => {
  assert.match(html, /data-workspace-command="archives"[^>]*data-admin-only/);
  assert.match(workspace, /const openArchiveManagementPanel = \(\) => \{/);
  assert.match(workspace, /!ensureWorkspaceAccess\(\) \|\| !canReview\(context\.role\)/);
  assert.match(workspace, /key:\s*'archives'/);
  assert.match(workspace, /data-admin-archive-management/);
  assert.match(workspace, /data-admin-archive-category/);
  assert.match(workspace, /data-admin-archive-results/);
  assert.match(workspace, /archive-admin-category-tabs/);
  assert.match(workspace, /command === 'archives' && canReview\(context\.role\)/);
  assert.match(workspace, /listAdminArchives/);
  assert.match(workspace, /data-delete-archive-confirmation/);
  assert.match(workspace, /client\.deleteArchive\(archive\.id\)/);
  assert.match(workspace, /palis:archive-directory-changed/);
  assert.match(workspace, /data-toggle-archive-new/);
  assert.match(workspace, /client\.setArchiveNewBadge\(archive\.id/);
  assert.match(workspace, /NEW 标记：开/);
  assert.match(workspace, /NEW 标记：关/);
});
