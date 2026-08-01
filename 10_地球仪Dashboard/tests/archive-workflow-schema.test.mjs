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
const archiveMediaGuardrailsMigrationUrl = new URL('supabase/migrations/202607290003_archive_media_guardrails.sql', projectRoot);
const clerkNativeEditorSourcesMigrationUrl = new URL('supabase/migrations/202607290004_clerk_native_editor_sources.sql', projectRoot);
const workspaceStickyNotesMigrationUrl = new URL('supabase/migrations/202607290005_workspace_sticky_notes.sql', projectRoot);
const archiveRecordBaseAmendmentsMigrationUrl = new URL('supabase/migrations/202607300001_archive_record_base_amendments.sql', projectRoot);
const archiveMediaSpeciesAnomalyMigrationUrl = new URL('supabase/migrations/202607300002_archive_media_species_anomaly_slots.sql', projectRoot);
const archiveMediaPrimarySlotsMigrationUrl = new URL('supabase/migrations/202607300003_archive_media_primary_slots.sql', projectRoot);
const archiveDirectorySlotReservationMigrationUrl = new URL('supabase/migrations/202607300007_archive_directory_slot_reservation.sql', projectRoot);
const privateDraftsMigrationUrl = new URL('supabase/migrations/202607300013_restore_admin_review_queue.sql', projectRoot);
const mainlinePersonnelReadMigrationUrl = new URL('supabase/migrations/202608010002_mainline_personnel_shared_read.sql', projectRoot);
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

test('archive index repair never truncates archive codes or formal numbers', async () => {
  const sql = await readFile(archiveIndexRecordRepairMigrationUrl, 'utf8').catch(() => '');

  assert.doesNotMatch(sql, /lpad\((?:new\.)?sequence_number::text,\s*2\s*,/i);
  assert.doesNotMatch(sql, /lpad\((?:archive(?:_record)?\.)?sequence_number::text,\s*3\s*,/i);
  assert.match(
    sql,
    /lpad\(\s*sequence_number::text,\s*greatest\(\s*2,\s*length\(sequence_number::text\)\s*\)/i,
  );
  assert.match(
    sql,
    /lpad\(\s*new\.sequence_number::text,\s*greatest\(\s*2,\s*length\(new\.sequence_number::text\)\s*\)/i,
  );
  assert.match(
    sql,
    /lpad\(\s*archive\.sequence_number::text,\s*greatest\(\s*3,\s*length\(archive\.sequence_number::text\)\s*\)/i,
  );
  assert.match(
    sql,
    /lpad\(\s*archive_record\.sequence_number::text,\s*greatest\(\s*3,\s*length\(archive_record\.sequence_number::text\)\s*\)/i,
  );
});

test('archive media guardrails lock reviewed files and enforce category slot limits', async () => {
  const sql = await readFile(archiveMediaGuardrailsMigrationUrl, 'utf8').catch(() => '');

  assert.match(sql, /new\.role = 'portrait'/i);
  assert.match(sql, /new\.role in \('event-cover', 'event-evidence'\)/i);
  assert.doesNotMatch(sql, /update public\.archive_attachments\s+set role\s*=\s*null/i);
  assert.match(sql, /create or replace function public\.validate_archive_attachment_slot/i);
  assert.match(sql, /mime_type\s*<>\s*'image\/webp'[\s\S]*819200/i);
  assert.match(sql, /'portrait'[\s\S]*'person'/i);
  assert.match(sql, /'event-cover'[\s\S]*'event-evidence'[\s\S]*'event'/i);
  assert.match(sql, /event-evidence[\s\S]*6/i);
  assert.match(sql, /status in \('draft', 'changes_requested'\)/i);
  assert.match(sql, /drop policy if exists attachments_owner_all/i);
  assert.match(sql, /drop policy if exists storage_archive_attachments_insert/i);
  assert.match(sql, /split_part\(storage_path,\s*'\/',\s*2\)\s*=\s*contribution_id::text/i);
  assert.match(sql, /archive\.visibility = 'public'/i);
});

test('clerk native editor migration securely refreshes existing archive directory projections', async () => {
  const sql = await readFile(clerkNativeEditorSourcesMigrationUrl, 'utf8').catch(() => '');

  assert.match(sql, /create or replace function public\.publish_archive_contribution/i);
  assert.match(sql, /security definer[\s\S]*set search_path\s*=\s*public/i);
  assert.match(sql, /if not public\.is_admin\(\)/i);
  assert.match(sql, /where id\s*=\s*p_contribution_id[\s\S]*status\s*=\s*'approved'[\s\S]*for update/i);
  assert.match(
    sql,
    /update public\.archives archive[\s\S]*title\s*=\s*coalesce\([\s\S]*draft_content\s*->\s*'indexData'\s*->>\s*'title'[\s\S]*summary\s*=\s*coalesce\([\s\S]*draft_content\s*->>\s*'summary'[\s\S]*index_payload\s*=\s*case[\s\S]*jsonb_typeof\([\s\S]*draft_content\s*->\s*'indexData'\)\s*=\s*'object'/i,
  );
  assert.match(sql, /archive_record\.category\s*<>\s*p_category/i);
  assert.match(sql, /status\s*=\s*'published'[\s\S]*revision\s*=\s*revision\s*\+\s*1/i);
});

test('workspace sticky notes migration persists shared content and self-owned layouts', async () => {
  const sql = await readFile(workspaceStickyNotesMigrationUrl, 'utf8').catch(() => '');

  assert.match(sql, /create table(?: if not exists)? public\.workspace_notes/i);
  assert.match(sql, /title text not null[\s\S]*check\s*\(\s*length\s*\(\s*trim\s*\(\s*title\s*\)\s*\)\s*>\s*0\s*\)/i);
  assert.match(sql, /content text not null[\s\S]*check\s*\(\s*length\s*\(\s*trim\s*\(\s*content\s*\)\s*\)\s*>\s*0\s*\)/i);
  assert.match(sql, /sort_order integer not null default 0[\s\S]*check\s*\(\s*sort_order\s*>=\s*0\s*\)/i);
  assert.match(sql, /created_by uuid not null(?: default auth\.uid\s*\(\s*\))? references public\.profiles\s*\(\s*id\s*\)/i);

  assert.match(sql, /create table(?: if not exists)? public\.workspace_note_layouts/i);
  assert.match(sql, /note_id uuid not null references public\.workspace_notes\s*\(\s*id\s*\)\s*on delete cascade/i);
  assert.match(sql, /profile_id uuid not null references public\.profiles\s*\(\s*id\s*\)\s*on delete cascade/i);
  assert.match(sql, /left_px integer not null[\s\S]*check\s*\(\s*left_px\s*>=\s*0\s*\)/i);
  assert.match(sql, /top_px integer not null[\s\S]*check\s*\(\s*top_px\s*>=\s*0\s*\)/i);
  assert.match(sql, /primary key\s*\(\s*note_id\s*,\s*profile_id\s*\)/i);
  assert.match(sql, /create index if not exists workspace_note_layouts_profile_idx[\s\S]*\(\s*profile_id\s*\)/i);

  assert.match(sql, /create trigger workspace_notes_updated_at[\s\S]*execute function public\.set_updated_at\s*\(\s*\)/i);
  assert.match(sql, /create trigger workspace_note_layouts_updated_at[\s\S]*execute function public\.set_updated_at\s*\(\s*\)/i);
  assert.match(sql, /alter table public\.workspace_notes enable row level security/i);
  assert.match(sql, /alter table public\.workspace_note_layouts enable row level security/i);
});

test('workspace sticky notes RLS excludes disabled observer and anonymous principals', async () => {
  const sql = await readFile(workspaceStickyNotesMigrationUrl, 'utf8').catch(() => '');

  assert.match(sql, /create or replace function public\.is_workspace_member\s*\(\s*\)[\s\S]*security definer[\s\S]*set search_path\s*=\s*public/i);
  assert.match(sql, /role\s+in\s*\(\s*'admin'\s*,\s*'clerk'\s*\)[\s\S]*enabled/i);
  assert.match(sql, /create policy workspace_notes_member_read[\s\S]*for select[\s\S]*to authenticated[\s\S]*public\.is_workspace_member\s*\(\s*\)/i);
  assert.match(sql, /create policy workspace_notes_admin_insert[\s\S]*for insert[\s\S]*public\.is_admin\s*\(\s*\)[\s\S]*created_by\s*=\s*auth\.uid\s*\(\s*\)/i);
  assert.match(sql, /create policy workspace_notes_admin_update[\s\S]*for update[\s\S]*public\.is_admin\s*\(\s*\)[\s\S]*public\.is_admin\s*\(\s*\)/i);
  assert.match(sql, /create policy workspace_notes_admin_delete[\s\S]*for delete[\s\S]*public\.is_admin\s*\(\s*\)/i);
  assert.match(sql, /new\.created_by\s*:=\s*old\.created_by/i);
  assert.match(sql, /new\.created_at\s*:=\s*old\.created_at/i);

  assert.match(sql, /create policy workspace_note_layouts_self_read[\s\S]*for select[\s\S]*public\.is_workspace_member\s*\(\s*\)[\s\S]*profile_id\s*=\s*auth\.uid\s*\(\s*\)/i);
  assert.match(sql, /create policy workspace_note_layouts_self_insert[\s\S]*for insert[\s\S]*public\.is_workspace_member\s*\(\s*\)[\s\S]*profile_id\s*=\s*auth\.uid\s*\(\s*\)/i);
  assert.match(sql, /create policy workspace_note_layouts_self_update[\s\S]*for update[\s\S]*profile_id\s*=\s*auth\.uid\s*\(\s*\)[\s\S]*profile_id\s*=\s*auth\.uid\s*\(\s*\)/i);
  assert.doesNotMatch(sql, /workspace_note_layouts[\s\S]{0,200}public\.is_admin\s*\(\s*\)/i);

  assert.match(sql, /revoke all on table public\.workspace_notes from anon/i);
  assert.match(sql, /revoke all on table public\.workspace_note_layouts from anon/i);
  assert.match(sql, /grant select, insert, update, delete on table public\.workspace_notes to authenticated/i);
  assert.match(sql, /grant select, insert, update on table public\.workspace_note_layouts to authenticated/i);
});

test('private draft policy keeps review queue records readable to administrators', async () => {
  const sql = await readFile(privateDraftsMigrationUrl, 'utf8');
  assert.match(sql, /public\.is_admin\(\)[\s\S]*status in \('submitted', 'in_review', 'approved'/i);
});

test('mainline personnel sharing opens only submitted stage-one dossiers and their portraits', async () => {
  const sql = await readFile(mainlinePersonnelReadMigrationUrl, 'utf8');
  assert.match(sql, /mainline_personnel_submissions_member_read[\s\S]*status in \('submitted', 'in_review', 'approved'/i);
  assert.match(sql, /draft_content -> 'mainline' ->> 'kind' = 'personnel'/i);
  assert.match(sql, /draft_content -> 'mainline' ->> 'stage' = '1'/i);
  assert.match(sql, /mainline_personnel_attachments_member_read/i);
  assert.match(sql, /storage_mainline_personnel_member_read/i);
  assert.doesNotMatch(sql, /status in \('draft'/i);
});

test('archive directory slot reservations allocate anomalies after A03 without changing the retained event range', async () => {
  const sql = await readFile(archiveDirectorySlotReservationMigrationUrl, 'utf8').catch(() => '');

  assert.match(sql, /create or replace function public\.archive_number_floor/i);
  assert.match(sql, /when 'event' then 1/i);
  assert.match(sql, /when 'anomaly' then 3/i);
});

test('archive media guardrails accept the new anomaly and species image slots', async () => {
  const sql = await readFile(archiveMediaSpeciesAnomalyMigrationUrl, 'utf8').catch(() => '');

  assert.match(sql, /create or replace function public\.validate_archive_attachment_slot/i);
  assert.match(sql, /'anomaly-cover'[\s\S]*'anomaly-image'[\s\S]*'anomaly'/i);
  assert.match(sql, /'species-cover'[\s\S]*'species-image'[\s\S]*'species'/i);
  assert.match(sql, /anomaly-cover' then 1 else 6/i);
  assert.match(sql, /species-cover' then 1 else 6/i);
});

test('archive media guardrails accept one primary image for every remaining archive category', async () => {
  const sql = await readFile(archiveMediaPrimarySlotsMigrationUrl, 'utf8').catch(() => '');

  assert.match(sql, /create or replace function public\.validate_archive_attachment_slot/i);
  assert.match(sql, /'country-flag'[\s\S]*'country'/i);
  assert.match(sql, /'organization-cover'[\s\S]*'organization'/i);
  assert.match(sql, /'station-cover'[\s\S]*'station'/i);
  assert.match(sql, /'entrance-cover'[\s\S]*'entrance'/i);
  assert.match(sql, /'ecology-cover'[\s\S]*'ecology'/i);
  assert.match(sql, /v_limit := 1/i);
});

test('archive-record amendments do not require a native source document', async () => {
  const sql = await readFile(archiveRecordBaseAmendmentsMigrationUrl, 'utf8').catch(() => '');

  assert.match(sql, /create or replace function public\.validate_archive_contribution_target/i);
  assert.match(sql, /if new\.target_contribution_id is null then[\s\S]*if new\.base_version_id is not null then/i);
  assert.doesNotMatch(sql, /archive_record\.origin\s*<>\s*'official'/i);
  assert.match(sql, /notify pgrst, 'reload schema'/i);
});
