# CloudBase PG Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the PALIS Supabase production data to the CloudBase PostgreSQL test environment while preserving existing public-data ownership and allowing administrators to reset user passwords after cutover.

**Architecture:** Reuse the committed Supabase migration history as the authoritative business schema. Create CloudBase registered users with the legacy Supabase UUID in `auth.users.sub`; retain the same UUID in public-domain rows, while replacing the incompatible `public.profiles.id -> auth.users.id` foreign key with CloudBase-compatible ownership checks through `auth.uid()`. Exclude Supabase-managed Auth, Storage metadata, Realtime, and Edge Function internals from the raw data import.

**Tech Stack:** PostgreSQL 17, CloudBase CLI 3.7+, CloudBase PG, Supabase PostgreSQL 17.6, Node.js project migrations.

---

### Task 1: Preserve target identity keys

**Files:**
- Source: `C:/Users/Administrator/Downloads/Supabase Snippet Untitled query.csv`
- Verification: CloudBase `auth.users`

- [x] Validate the exported `public.profiles` records: eight records, valid UUIDs and email addresses, no duplicate UUIDs.
- [x] Create eight CloudBase external users with the source UUID as the custom UID (`auth.users.sub`), without copying source passwords.
- [x] Set the source administrator's target nickname to `柔光灯`.
- [x] Verify that all eight legacy UUIDs exist in CloudBase `auth.users.sub`.

### Task 2: Build a CloudBase-compatible schema bundle

**Files:**
- Source: `supabase/migrations/*.sql`
- Create: `cloudbase/migrations/202608030001_palis_schema.sql`
- Create: `cloudbase/migrations/202608030002_palis_rls.sql`
- Test: `tests/cloudbase-schema-compatibility.test.mjs`

- [ ] Identify and remove Supabase-only statements: `auth.users(id)` UUID foreign keys, Supabase Storage-only assumptions, Realtime publication statements, and Supabase migration bookkeeping.
- [ ] Retain business tables, indexes, constraints, triggers, functions, grants, and RLS policies that are valid for CloudBase PG.
- [ ] Change the `public.profiles` ownership model to retain UUID IDs and compare ownership against CloudBase `auth.uid()` / the preserved user `sub` value.
- [ ] Add a static compatibility test that fails if the CloudBase bundle references `auth.users(id)`, `supabase_realtime`, or `realtime` publication statements.
- [ ] Execute the bundle on the test environment in dependency order and verify the expected public tables exist.

### Task 3: Export and load business data

**Files:**
- Create: `cloudbase/scripts/export-supabase-public-data.mjs`
- Create: `cloudbase/scripts/import-cloudbase-public-data.mjs`
- Create: `cloudbase/migration-input/README.md`
- Test: `tests/cloudbase-data-import.test.mjs`

- [ ] Export only the Supabase `public` business tables using a source connection string entered locally at runtime; never commit or print the connection string.
- [ ] Load parent tables before child tables and use parameterized batch inserts; preserve primary keys and legacy user UUID columns.
- [ ] Exclude Supabase system schemas (`auth`, `storage`, `extensions`, `realtime`, `supabase_migrations`) from the data export.
- [ ] Verify per-table row counts between source and target and fail the import if a count differs.

### Task 4: Handle files and application cutover separately

**Files:**
- Modify: `src/archive-workflow/repositories/supabase-repository.js`
- Modify: `src/auth.js`
- Modify: `supabase/functions/admin-manage-user/index.ts`
- Modify: `supabase/functions/admin-invite-user/index.ts`
- Create: `docs/CLOUDBASE_CUTOVER.md`

- [ ] Confirm the source Storage bucket object count; migrate objects separately only if files exist.
- [ ] Replace Supabase SDK calls and Edge Functions with CloudBase JS SDK and Cloud Functions before production cutover.
- [ ] Do not enable Supabase Realtime behavior on CloudBase; the current project does not rely on it, and CloudBase PG does not provide a compatible Realtime feature.
- [ ] After application testing, set target passwords or use the CloudBase reset flow, then switch environment configuration during a short write pause.

### Task 5: Acceptance verification

**Files:**
- Test: `tests/cloudbase-schema-compatibility.test.mjs`
- Test: `tests/cloudbase-data-import.test.mjs`
- Create: `docs/reports/2026-08-03-cloudbase-pg-migration-verification.md`

- [ ] Verify all source `public` table row counts match CloudBase.
- [ ] Verify all eight legacy UIDs exist in `auth.users.sub` and all profile IDs still resolve to those values.
- [ ] Verify non-admin RLS rejects cross-user reads and writes, while the migrated administrator can complete the archive workflow.
- [ ] Keep Supabase in read-only fallback mode for seven days after production cutover.
