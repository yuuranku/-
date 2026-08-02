# 静态档案与书记官工作台联动 Implementation Plan

> **For agentic workers:** Execute the tasks in order in the shared workspace. Do not reset, clean, stage, commit, or overwrite unrelated user changes.

**Goal:** Every pre-existing public archive opens in the clerk workspace with its matching original content prefilled, while new archives and amendments retain the existing review and publication workflow.

**Architecture:** Keep each original public page as the public renderer. Give every static record a durable Supabase archive row, and have the server identify its original static-base source. The existing client source adapter converts that source into the same v2 editor document used by clerk-created records; amendments create later versions without replacing the original public page.

**Tech Stack:** Vanilla JavaScript, Node test runner, Supabase PostgreSQL migrations/RPC, Cloudflare static worker deployment.

## Global Constraints

- Preserve the existing public archive UI and all original content/media URLs.
- Reuse existing archive categories, templates, clerk roles, review queue, and publication functions.
- New records remain independent archive rows; amendments only create new versions for their selected record.
- Migrations must be idempotent and must not alter existing community records, published versions, attachments, or user-authored drafts.
- Work only in the shared dirty workspace; do not stage, commit, reset, or clean it.

---

### Task 1: Define complete static baseline coverage

**Files:**
- Modify: `src/archive-workflow/official-archive-baseline.js`
- Modify: `tests/official-archive-baseline.test.mjs`

**Consumes:** `ARCHIVE_ROOTS`, `ARCHIVE_TEMPLATE_BY_CODE`.

**Produces:** `buildOfficialWorkspaceBaselines()` returns one normalized baseline for every static public record across all nine categories.

- [ ] Write a failing test asserting the set covers categories `country`, `organization`, `station`, `entrance`, `ecology`, `person`, `event`, `anomaly`, and `species`, and has exactly the sum of `ARCHIVE_ROOTS[*].children.length` records.
- [ ] Run `node --test tests/official-archive-baseline.test.mjs` and verify it fails because the current `OFFICIAL_BASELINE_CODES` excludes categories.
- [ ] Replace the partial category-code set with all template codes represented by `ARCHIVE_ROOTS`; retain existing record metadata conversion and idempotent local hydration.
- [ ] Re-run `node --test tests/official-archive-baseline.test.mjs` and verify it passes.

### Task 2: Make original source selection consistently prefill the editor

**Files:**
- Modify: `src/archive-workflow/repositories/supabase-repository.js`
- Modify: `src/archive-workflow/workspace.js`
- Modify: `tests/supabase-archive-workflow-repository.test.mjs`
- Modify: `tests/clerk-native-editor-browser.test.mjs`

**Consumes:** `toEditorDocumentFromArchiveBase(archive, staticRoot, template)` and the RPC response with `sourceKind: 'official-static'`.

**Produces:** `loadArchiveEditorSource()` supplies a populated v2 document for any imported static archive; the amendment event displays a visible error instead of creating an empty form when no source exists.

- [ ] Write a failing repository test for an organization and an event `official-static` RPC response, asserting their original fixed fields and custom sections are present in the returned editor document.
- [ ] Run `node --test tests/supabase-archive-workflow-repository.test.mjs` and verify the assertions fail before the source resolution change.
- [ ] Resolve the static root by template code for every category, then convert the RPC static source through `toEditorDocumentFromArchiveBase` before the editor opens.
- [ ] Add a browser-level regression test that clicks an original archive’s modification request and asserts representative original values are present in its native form before submission.
- [ ] Guard the amendment event so an unavailable archive ID or failed source load reports a workspace error and returns without opening a blank amendment draft.
- [ ] Run both focused tests and verify they pass.

### Task 3: Seed every static archive in Supabase without replacing user work

**Files:**
- Create: `scripts/generate-static-archive-seed.mjs`
- Create: `supabase/migrations/202607300008_seed_all_static_archive_bases.sql`
- Modify: `tests/official-archive-baseline.test.mjs`
- Modify: `package.json`

**Consumes:** `ARCHIVE_ROOTS`, `buildOfficialWorkspaceBaselines()`.

**Produces:** A deterministic SQL migration containing all original archive metadata and a package script that regenerates it from the current static data.

- [ ] Write a failing test that reads the generated migration and asserts that every `buildOfficialWorkspaceBaselines()` code occurs once, every row uses `origin = 'official'`, and the conflict clause only skips existing rows.
- [ ] Run `node --test tests/official-archive-baseline.test.mjs` and verify it fails because the all-category migration and generator do not exist.
- [ ] Implement a generator that serializes each normalized baseline into a SQL `VALUES` record, escaping SQL literals, and writes a single idempotent insert keyed by `business_code`/`code`.
- [ ] Add an `archive:seed-static` package script that runs the generator; execute it to create the migration.
- [ ] Include only archive identity and index metadata in the migration. The existing RPC/client static-source adapter remains the authoritative conversion path for full original body fields, sections, and static media URLs, keeping the stored baseline safe from incompatible legacy markup.
- [ ] Run the focused baseline test and `npm.cmd run archive:seed-static`; inspect that the generator output is deterministic by running it twice and checking `git diff --check`.

### Task 4: Apply and verify the server baseline

**Files:**
- Modify only if required by Supabase migration diagnostics: `supabase/migrations/202607300008_seed_all_static_archive_bases.sql`

**Consumes:** the generated migration and configured Supabase project credentials.

**Produces:** One server archive row per static original archive, searchable from public-page amendment requests.

- [ ] Run the repository’s configured Supabase migration command to apply pending migrations.
- [ ] Query the authenticated server archive list and compare codes with `buildOfficialWorkspaceBaselines()`; report any missing code rather than creating a substitute record.
- [ ] Open representative original organization, event, anomaly, species, country, station, entrance, ecology, and person archives as a clerk; verify fixed fields, original text, custom notes, and media references are prefilled.
- [ ] Submit no test data to production during this verification; use source loading only.

### Task 5: Full regression verification

**Files:**
- No production file changes required.

- [ ] Run the focused static-baseline, source-adapter, repository, and clerk-browser tests.
- [ ] Run `npm.cmd run build`.
- [ ] Run the full test suite. If pre-existing unrelated failures remain, list them separately with their failing test names and show that all tests directly changed by this work pass.
- [ ] Verify the public archive pages retain their original markup classes and that the new logic only affects server lookup and editor initialization.
