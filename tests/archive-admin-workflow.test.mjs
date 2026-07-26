import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const projectRoot = new URL('../', import.meta.url);
const [workspace, client, migration] = await Promise.all([
  readFile(new URL('src/archive-workflow/workspace.js', projectRoot), 'utf8'),
  readFile(new URL('src/archive-workflow/client.js', projectRoot), 'utf8'),
  readFile(new URL('supabase/migrations/202607270001_archive_workflow.sql', projectRoot), 'utf8'),
]);

test('administrator user management only invites clerks or observers', () => {
  assert.match(workspace, /data-admin-user-management/);
  assert.match(workspace, /value="clerk"/);
  assert.match(workspace, /value="observer"/);
  const userPanel = workspace.slice(workspace.indexOf('data-admin-user-management'));
  assert.doesNotMatch(userPanel.slice(0, userPanel.indexOf('</form>')), /value="admin"/);
  assert.match(client, /admin-invite-user/);
});

test('review pane requires a written reply before approval or return', () => {
  assert.match(workspace, /data-review-queue/);
  assert.match(workspace, /data-review-message[^>]+required/);
  assert.match(workspace, /data-review-decision="approved"/);
  assert.match(workspace, /data-review-decision="changes_requested"/);
  assert.match(workspace, /reviewSubmission/);
  assert.match(client, /Review reply is required/);
});

test('approved submissions can be formally registered with archive marks', () => {
  assert.match(workspace, /data-registration-form/);
  assert.match(workspace, /name="mother"/);
  assert.match(workspace, /name="archival"/);
  assert.match(workspace, /value="public"/);
  assert.match(workspace, /value="sealed"/);
  assert.match(workspace, /value="offline"/);
  assert.match(workspace, /引用复核/);
  assert.match(workspace, /VER 0\.1 \/ 白幕初垂 \/ 已录入/);
  assert.match(workspace, /publishContribution/);
});

test('database publication flags dependent references for re-review', () => {
  assert.match(migration, /set needs_review = true/i);
  assert.match(migration, /reference_review_required = true/i);
  assert.match(migration, /mother_version_id/i);
  assert.match(migration, /is_archived/i);
});
