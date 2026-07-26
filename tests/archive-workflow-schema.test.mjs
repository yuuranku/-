import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const projectRoot = new URL('../', import.meta.url);
const migrationUrl = new URL('supabase/migrations/202607270001_archive_workflow.sql', projectRoot);
const inviteFunctionUrl = new URL('supabase/functions/admin-invite-user/index.ts', projectRoot);

test('archive workflow schema defines all persisted resources and enables RLS', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const tables = [
    'profiles', 'user_invites', 'archive_templates', 'archives', 'archive_contributions',
    'archive_versions', 'archive_reviews', 'archive_references', 'archive_notifications',
    'archive_attachments', 'observer_access',
  ];

  for (const table of tables) {
    assert.match(sql, new RegExp(`create table(?: if not exists)? public\\.${table}`, 'i'));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.match(sql, /717652849@qq\.com/i);
  assert.match(sql, /check \(role in \('admin', 'clerk', 'observer'\)\)/i);
  assert.match(sql, /check \(status in \('draft', 'submitted', 'in_review', 'changes_requested', 'approved', 'published', 'sealed', 'offline'\)\)/i);
  assert.match(sql, /service_role/i);
  assert.match(sql, /is_admin\(\)/i);
  assert.match(sql, /create or replace function public\.review_archive_submission/i);
  assert.match(sql, /create or replace function public\.publish_archive_contribution/i);
  assert.match(sql, /create or replace function public\.notify_archive_submission/i);
  assert.match(sql, /create or replace function public\.list_public_archive_contributions/i);
  assert.match(sql, /insert into storage\.buckets/i);
  assert.match(sql, /archive-attachments/i);
  assert.match(sql, /insert into public\.archive_references[\s\S]*jsonb_array_elements/i);
  assert.match(sql, /contribution\.status = 'published' and archive\.visibility = 'public'/i);
  assert.match(sql, /references_visible_read[\s\S]*visibility = 'public'/i);
  assert.match(sql, /insert into public\.archive_templates/i);
});

test('user invitation function only accepts clerk or observer and verifies admin', async () => {
  const source = await readFile(inviteFunctionUrl, 'utf8');
  assert.match(source, /717652849@qq\.com/i);
  assert.match(source, /role !== 'clerk' && role !== 'observer'/);
  assert.match(source, /profiles/);
  assert.match(source, /role.*admin/s);
  assert.match(source, /inviteUserByEmail/);
  assert.doesNotMatch(source, /VITE_SUPABASE_SERVICE_ROLE_KEY/);
});
