import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const projectRoot = new URL('../', import.meta.url);
const migrationUrl = new URL('supabase/migrations/202607270001_archive_workflow.sql', projectRoot);
const repairMigrationUrl = new URL('supabase/migrations/202607270002_repair_admin_and_official_archives.sql', projectRoot);
const editorPipelineMigrationUrl = new URL('supabase/migrations/202607270003_archive_editor_pipeline.sql', projectRoot);
const versionRepairMigrationUrl = new URL('supabase/migrations/202607270004_repair_archive_version_lineage.sql', projectRoot);
const automaticIdentityMigrationUrl = new URL('supabase/migrations/202607290001_automatic_archive_identity.sql', projectRoot);
const archiveIndexRecordRepairMigrationUrl = new URL('supabase/migrations/202607290002_archive_index_record_repair.sql', projectRoot);
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

test('follow-up migration repairs pre-existing administrator accounts and registers official archives', async () => {
  const sql = await readFile(repairMigrationUrl, 'utf8');
  assert.match(sql, /from auth\.users/i);
  assert.match(sql, /717652849@qq\.com/i);
  assert.match(sql, /on conflict \(id\) do update/i);
  assert.match(sql, /role\s*=\s*'admin'/i);
  assert.match(sql, /enabled\s*=\s*true/i);
  assert.match(sql, /add column if not exists origin/i);
  assert.match(sql, /'official'/i);
  assert.match(sql, /O02[\s\S]*O05[\s\S]*O24/i);
  assert.match(sql, /EV10/i);
  assert.match(sql, /S01[\s\S]*S07/i);
});

test('editor pipeline lets enabled clerks and administrators create cloud drafts', async () => {
  const sql = await readFile(editorPipelineMigrationUrl, 'utf8');
  assert.match(sql, /drop policy if exists contributions_owner_insert/i);
  assert.match(sql, /role\s+in\s*\(\s*'clerk'\s*,\s*'admin'\s*\)/i);
  assert.match(sql, /p\.enabled/i);
  assert.match(sql, /owner_id\s*=\s*auth\.uid\(\)/i);
});

test('editor pipeline allocates permanent category numbers only when archives are inserted', async () => {
  const sql = await readFile(editorPipelineMigrationUrl, 'utf8');
  assert.match(sql, /add column if not exists sequence_number integer/i);
  assert.match(sql, /add column if not exists abbreviation text/i);
  assert.match(sql, /create table if not exists public\.archive_number_counters/i);
  assert.match(sql, /on conflict \(category\)[\s\S]*last_value\s*=\s*public\.archive_number_counters\.last_value\s*\+\s*1/i);
  assert.match(sql, /create trigger allocate_archive_number/i);
  assert.match(sql, /unique index[\s\S]*category[\s\S]*sequence_number/i);
  assert.match(sql, /base_version_id uuid references public\.archive_versions/i);
  assert.match(sql, /add column if not exists mother_version_id uuid references public\.archive_versions/i);
  assert.match(sql, /inherit_archive_version_base/i);
  assert.match(sql, /new\.mother_version_id\s*:=\s*contribution_base/i);
  for (const abbreviation of ['REG', 'CHN', 'LOG', 'CRD', 'ECO', 'PER', 'RLL', 'TRC', 'SPC']) {
    assert.match(sql, new RegExp(`'${abbreviation}'`));
  }
});

test('version lineage repair supplies the trigger field for already-migrated projects', async () => {
  const sql = await readFile(versionRepairMigrationUrl, 'utf8').catch(() => '');
  assert.match(sql, /alter table public\.archive_versions[\s\S]*add column if not exists mother_version_id uuid references public\.archive_versions/i);
  assert.match(sql, /create or replace function public\.inherit_archive_version_base/i);
  assert.match(sql, /create trigger inherit_archive_version_base/i);
});

test('archive identity migration owns category codes and archive-level version increments', async () => {
  const sql = await readFile(automaticIdentityMigrationUrl, 'utf8');
  assert.match(sql, /create or replace function public\.archive_code_prefix/i);
  assert.match(sql, /new\.code\s*:=\s*public\.archive_code_prefix\(new\.category\)\s*\|\|\s*new\.sequence_number/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /create trigger allocate_archive_version_label/i);
  assert.match(sql, /new\.version_label\s*:=\s*case/i);
  assert.match(sql, /create trigger synchronize_published_notification_version/i);
});

test('archive index repair migrates identities, projections, NEW state, and media metadata atomically', async () => {
  const sql = await readFile(archiveIndexRecordRepairMigrationUrl, 'utf8').catch(() => '');

  assert.match(sql, /add column if not exists business_code text/i);
  assert.match(sql, /add column if not exists index_payload jsonb not null default '\{\}'::jsonb/i);
  assert.match(sql, /add column if not exists new_badge_visible boolean not null default false/i);
  assert.match(sql, /add column if not exists role text/i);
  assert.match(sql, /add column if not exists caption text/i);
  assert.match(sql, /add column if not exists alt_text text/i);
  assert.match(sql, /add column if not exists sort_order integer not null default 0/i);

  assert.match(sql, /create temporary table archive_identity_repair/i);
  assert.match(sql, /MIGRATING:/i);
  assert.match(sql, /AUTO:%/i);
  assert.match(sql, /greatest[\s\S]*archive_number_floor/i);
  for (const [category, floor] of [
    ['country', 18],
    ['organization', 24],
    ['station', 20],
    ['entrance', 18],
    ['ecology', 7],
    ['person', 46],
    ['event', 26],
    ['anomaly', 25],
    ['species', 22],
  ]) {
    assert.match(sql, new RegExp(`when '${category}' then ${floor}`, 'i'));
  }

  assert.match(sql, /create or replace function public\.publish_archive_contribution/i);
  assert.match(sql, /index_payload[\s\S]*draft_content\s*->\s*'indexData'/i);
  assert.match(sql, /new_badge_visible[\s\S]*true/i);
  assert.match(sql, /target_contribution_id[\s\S]*archive_id\s*<>\s*v_archive_id/i);
  assert.match(sql, /'formalNumber'/i);
  assert.match(sql, /'sequenceNumber'/i);
  assert.match(sql, /'abbreviation'/i);
  assert.match(sql, /create or replace function public\.list_archive_documents/i);
  assert.match(sql, /create or replace function public\.validate_archive_contribution_target/i);
  assert.match(sql, /target_record\.kind\s*=\s*'amendment'/i);
  assert.match(sql, /base_record\.contribution_id\s*<>\s*new\.target_contribution_id/i);
  assert.match(sql, /new\.base_version_id\s+is\s+null[\s\S]*base version is required/i);
  assert.match(sql, /p_archive_id\s*<>\s*contribution\.archive_id/i);
  assert.match(sql, /create trigger validate_archive_contribution_target_before_submit/i);
  assert.match(sql, /synchronize_published_notification_version[\s\S]*formal_number/i);
  assert.match(sql, /notify pgrst,\s*'reload schema'/i);
});
