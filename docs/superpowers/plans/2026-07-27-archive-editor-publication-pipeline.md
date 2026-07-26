# PALIS Archive Editor and Publication Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the nine dossier cards the real clerk/admin editor and reliably transform approved submissions into the existing public archive style with automatic numbering, version, collector, and modifier attribution.

**Architecture:** A same-origin editor bridge serializes `[data-save]` fields from the template iframe into a versioned JSON document. Supabase stores drafts and immutable approved versions; a category-aware publication renderer turns that JSON into the existing archive-window presentation. Database functions own numbering and privileged transitions so concurrent approvals and admin/clerk permissions remain correct.

**Tech Stack:** Vite, vanilla JavaScript, Node test runner, Supabase Postgres/RLS/Edge Functions, Cloudflare Workers static assets.

## Global Constraints

- The right-side nine dossier cards are editors, not the public presentation.
- Public archives retain the current website visual style.
- Public section order and field groups follow the selected dossier card.
- Admin and clerk can both create, edit, autosave, and submit dossiers.
- Observer cannot enter the workbench.
- The protected administrator cannot be deleted, disabled, or demoted.
- Formal numbers are allocated only on accession and are never reused.
- Existing official records remain labeled `官方档案`.
- Do not store plaintext or reversibly encrypted user passwords.
- Preserve current uncommitted user changes and the existing `tmp/` directory.

---

### Task 1: Repair cloud draft permissions and surface real errors

**Files:**
- Create: `supabase/migrations/202607270003_archive_editor_pipeline.sql`
- Modify: `src/archive-workflow/autosave.js`
- Modify: `src/archive-workflow/workspace.js`
- Test: `tests/archive-workflow-schema.test.mjs`
- Test: `tests/archive-autosave.test.mjs`

**Interfaces:**
- Consumes: `public.profiles.role`, `createAutosaveController({ remote, onState })`.
- Produces: RLS insert policy allowing enabled `clerk` or `admin`; autosave error detail `{ status, error, category }`.

- [ ] **Step 1: Write the failing schema test**

```js
test('draft insert policy permits enabled clerks and administrators', async () => {
  const sql = await readFile(pipelineMigrationUrl, 'utf8');
  assert.match(sql, /role\s+in\s*\('clerk',\s*'admin'\)/i);
  assert.match(sql, /p\.enabled/i);
});
```

- [ ] **Step 2: Run the schema test and verify it fails**

Run: `node --test tests/archive-workflow-schema.test.mjs`

Expected: FAIL because `202607270003_archive_editor_pipeline.sql` does not exist.

- [ ] **Step 3: Add the replacement RLS policy**

```sql
drop policy if exists contributions_owner_insert on public.archive_contributions;
create policy contributions_owner_insert
on public.archive_contributions
for insert
to authenticated
with check (
  owner_id = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.enabled
      and p.role in ('clerk', 'admin')
  )
);
```

- [ ] **Step 4: Write the failing autosave error classification test**

```js
test('permission failures remain permission failures instead of offline state', async () => {
  const controller = createAutosaveController({
    storage,
    remote: { saveDraft: async () => { throw Object.assign(new Error('row-level security'), { code: '42501' }); } },
    onState: (state, detail) => states.push({ state, detail }),
  });
  controller.queue({ key: 'draft:admin', content: {} });
  const result = await controller.flushRemote();
  assert.equal(result.status, 'permission-denied');
  assert.equal(states.at(-1).state, 'permission-denied');
});
```

- [ ] **Step 5: Run the autosave test and verify it fails**

Run: `node --test tests/archive-autosave.test.mjs`

Expected: FAIL because the controller returns `offline-saved`.

- [ ] **Step 6: Implement error classification**

Add `classifyRemoteError(error)` returning `session-expired`, `permission-denied`, `network-error`, or `cloud-error`; emit that state and preserve the local draft.

- [ ] **Step 7: Update workspace messages**

Map the new states to:

```js
{
  'session-expired': '登录状态已失效，请重新登录后同步。',
  'permission-denied': '当前账号没有建立云端草稿的权限。',
  'network-error': '网络中断，内容已安全保存在本机。',
  'cloud-error': '云端暂存失败，请查看错误并重试。',
}
```

- [ ] **Step 8: Run focused and full tests**

Run: `node --test tests/archive-autosave.test.mjs tests/archive-workflow-schema.test.mjs`

Expected: PASS.

Run: `npm.cmd test`

Expected: all tests PASS.

---

### Task 2: Define the versioned template document format

**Files:**
- Create: `src/archive-workflow/editor-document.js`
- Modify: `src/archive-workflow/templates.js`
- Test: `tests/archive-editor-document.test.mjs`

**Interfaces:**
- Produces: `createEditorDocument(template, values)`, `normalizeEditorDocument(value)`, `templateArchiveAbbreviation(code)`.
- Document shape:

```js
{
  schemaVersion: 2,
  templateCode: '06',
  category: 'person',
  abbreviation: 'PER',
  title: '姓名',
  businessCode: '',
  values: { hero: '姓名', dossierNo: '', entryCode: '', f_xxx: '字段值' },
  references: [],
  media: [],
}
```

- [ ] **Step 1: Write failing format and abbreviation tests**

Assert all mappings:

```js
{
  '01': 'REG', '02': 'CHN', '03': 'LOG',
  '04': 'CRD', '05': 'ECO', '06': 'PER',
  '07': 'RLL', '08': 'TRC', '09': 'SPC',
}
```

Also assert unknown fields survive normalization and `schemaVersion` is `2`.

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test tests/archive-editor-document.test.mjs`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the document helpers and template metadata**

Extend each `ARCHIVE_TEMPLATES` item with `abbreviation`, `titleKey: 'hero'`, `dossierKey: 'dossierNo'`, and `businessCodeKey: 'entryCode'`.

- [ ] **Step 4: Run the test**

Run: `node --test tests/archive-editor-document.test.mjs`

Expected: PASS.

---

### Task 3: Turn the template iframe into the real editor

**Files:**
- Create: `src/archive-workflow/editor-bridge.js`
- Modify: `src/archive-workflow/workspace.js`
- Modify: `src/archive-workflow/workspace.css`
- Test: `tests/archive-editor-bridge.test.mjs`
- Test: `tests/clerk-workflow-ui.test.mjs`

**Interfaces:**
- Consumes: `iframe`, `EditorDocument`.
- Produces: `createTemplateEditorBridge({ iframe, initialDocument, onChange, onReferenceTrigger })`.
- Bridge methods: `ready`, `read()`, `write(document)`, `setReadOnly(boolean)`, `dispose()`.

- [ ] **Step 1: Write a failing DOM-fixture test**

Use a minimal fake document containing:

```html
<div data-save="hero" contenteditable>叶夫根尼</div>
<div data-save="entryCode" contenteditable>HZ-6</div>
<div id="photoBox"></div>
```

Assert `read()` returns both values and an input event calls `onChange` with the updated document.

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/archive-editor-bridge.test.mjs`

Expected: FAIL because the bridge does not exist.

- [ ] **Step 3: Implement same-origin serialization**

Read `textContent` from every `[data-save]`, load initial values after iframe `load`, observe input and photo style changes, and prevent the template-level `SAVE_KEY` from becoming the workflow source of truth.

- [ ] **Step 4: Replace the duplicated simplified form**

Keep a compact workflow rail with mode, target, status, attachments, review reply, save, and submit. Make the template iframe the only content editor.

- [ ] **Step 5: Connect bridge changes to autosave**

Every bridge change calls:

```js
autosave.queue({
  ...editorDraft,
  content: editorBridge.read(),
});
```

Before submit call `editorBridge.read()` and then `flushRemote()`.

- [ ] **Step 6: Run focused tests**

Run: `node --test tests/archive-editor-bridge.test.mjs tests/clerk-workflow-ui.test.mjs`

Expected: PASS.

---

### Task 4: Replace manual amendment IDs with an archive picker

**Files:**
- Modify: `src/archive-workflow/client.js`
- Modify: `src/archive-workflow/workspace.js`
- Test: `tests/archive-workflow-client.test.mjs`
- Test: `tests/clerk-workspace.test.mjs`

**Interfaces:**
- Produces: `listEditableArchives({ query, category, limit = 30 })`.
- Selected target shape: `{ id, code, title, category, currentVersionId, currentContent }`.

- [ ] **Step 1: Write failing client and UI tests**

Assert the client queries public/accessible archives by title or code, and the editor contains a selectable list without a `targetContributionId` text input.

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/archive-workflow-client.test.mjs tests/clerk-workspace.test.mjs`

Expected: FAIL because the picker method and UI are absent.

- [ ] **Step 3: Implement the picker query**

Select `id,code,title,category,origin,visibility` ordered with populated public records first, filtered to the current template category.

- [ ] **Step 4: Load the effective published version**

When selected, prefill the editor document and set `archive_id` plus `base_version_id`; do not require internal IDs from the user.

- [ ] **Step 5: Run focused tests**

Run: `node --test tests/archive-workflow-client.test.mjs tests/clerk-workspace.test.mjs`

Expected: PASS.

---

### Task 5: Allocate formal archive numbers atomically

**Files:**
- Modify: `supabase/migrations/202607270003_archive_editor_pipeline.sql`
- Modify: `src/archive-workflow/client.js`
- Test: `tests/archive-workflow-schema.test.mjs`

**Interfaces:**
- Produces: `public.archive_number_counters`, `archives.sequence_number`, `archives.abbreviation`, and updated `publish_archive_contribution(...)`.
- Formal display number: `{sequence_number padded to 3 digits}.{abbreviation}`; business code remains separate.

- [ ] **Step 1: Write failing migration assertions**

Assert the migration creates a per-template counter, locks it using `insert ... on conflict ... do update returning`, and assigns only when a new archive is published.

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/archive-workflow-schema.test.mjs`

Expected: FAIL because the counter is absent.

- [ ] **Step 3: Implement counter and archive columns**

Add:

```sql
alter table public.archives add column if not exists sequence_number integer;
alter table public.archives add column if not exists abbreviation text;
alter table public.archive_contributions add column if not exists base_version_id uuid references public.archive_versions(id);
```

Create `archive_number_counters(template_code primary key, last_value integer not null)` and update the publish function to allocate a number only for new archives.

- [ ] **Step 4: Add uniqueness**

Create a unique index on `(category, sequence_number)` where sequence number is not null.

- [ ] **Step 5: Run schema tests**

Run: `node --test tests/archive-workflow-schema.test.mjs`

Expected: PASS.

---

### Task 6: Render template sections in the existing public archive style

**Files:**
- Create: `src/archive-workflow/public-renderer.js`
- Modify: `src/archive-workflow/publication.js`
- Modify: `src/style.css`
- Test: `tests/archive-public-renderer.test.mjs`
- Test: `tests/archive-publication.test.mjs`

**Interfaces:**
- Consumes: approved `EditorDocument`, template metadata, version attribution.
- Produces: `renderFormalArchiveDocument({ archive, contribution, version, template })`.

- [ ] **Step 1: Write failing renderer tests**

For person and event fixtures, assert:

- output uses existing archive panel classes;
- output includes `VER 0.1`;
- official records show `档案收录者 / 官方档案`;
- amendments show `档案修改者`;
- section labels follow template field-group order;
- empty fields are omitted;
- values are HTML escaped.

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/archive-public-renderer.test.mjs tests/archive-publication.test.mjs`

Expected: FAIL because the renderer does not exist.

- [ ] **Step 3: Implement category-aware section models**

Map template source labels to public sections. Use the template document keys as the stable data source and the current archive classes as the presentation shell.

- [ ] **Step 4: Integrate with contribution tabs**

Replace generic `renderFields(version.content?.fields)` with `renderFormalArchiveDocument(...)`. Keep the actual-count contribution switcher and official-record tab.

- [ ] **Step 5: Add attribution and version styling**

Add compact metadata rows for formal number, version, collector, modifiers, accession date, and last modification date.

- [ ] **Step 6: Run focused tests**

Run: `node --test tests/archive-public-renderer.test.mjs tests/archive-publication.test.mjs`

Expected: PASS.

---

### Task 7: Review the formal preview and publish the same data

**Files:**
- Modify: `src/archive-workflow/workspace.js`
- Modify: `src/archive-workflow/client.js`
- Test: `tests/archive-admin-workflow.test.mjs`
- Test: `tests/clerk-workflow-ui.test.mjs`

**Interfaces:**
- Produces review tabs `正式档案预览`, `原始设定卡`, `修改差异`, `引用与附件`.

- [ ] **Step 1: Write failing review UI tests**

Assert the review queue no longer renders raw `JSON.stringify(draft_content)` as the primary view and includes the formal renderer.

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/archive-admin-workflow.test.mjs tests/clerk-workflow-ui.test.mjs`

Expected: FAIL because raw JSON remains.

- [ ] **Step 3: Render the exact publication preview**

Call `renderFormalArchiveDocument` with the pending draft and proposed version. Show structured raw data only under the secondary “原始设定卡” tab.

- [ ] **Step 4: Preserve review rounds**

Returning a draft creates a review row and notification; resubmission keeps earlier review messages and increments revision.

- [ ] **Step 5: Publish through one accession confirmation**

The admin button collects visibility and marks, then calls `publishArchive(...)`; the returned archive/version IDs update the queue without a second manual content copy.

- [ ] **Step 6: Run focused tests**

Run: `node --test tests/archive-admin-workflow.test.mjs tests/clerk-workflow-ui.test.mjs`

Expected: PASS.

---

### Task 8: Add slash-triggered archive references

**Files:**
- Create: `src/archive-workflow/inline-references.js`
- Modify: `src/archive-workflow/editor-bridge.js`
- Modify: `src/archive-workflow/workspace.js`
- Test: `tests/archive-inline-references.test.mjs`

**Interfaces:**
- Produces: `createInlineReferenceController({ search, insert, debounceMs: 200, limit: 8 })`.

- [ ] **Step 1: Write failing query/parser tests**

Assert `/文` yields query `文`, selection inserts an atomic token containing `archiveId`, `code`, and `title`, Escape closes results, and unselected slash text stays text.

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/archive-inline-references.test.mjs`

Expected: FAIL because the controller is absent.

- [ ] **Step 3: Implement the controller**

Search title and code, render at most eight choices, support arrow keys/Enter/Escape, and store references separately from the display token.

- [ ] **Step 4: Render public references as archive-opening buttons**

Convert tokens to elements using `data-open-archive-reference`.

- [ ] **Step 5: Run the test**

Run: `node --test tests/archive-inline-references.test.mjs`

Expected: PASS.

---

### Task 9: Replace invitations with protected account management

**Files:**
- Create: `supabase/functions/admin-manage-user/index.ts`
- Modify: `src/archive-workflow/client.js`
- Modify: `src/archive-workflow/workspace.js`
- Test: `tests/archive-account-management.test.mjs`
- Test: `tests/archive-workflow-schema.test.mjs`

**Interfaces:**
- Edge actions: `list`, `create`, `update-role`, `reset-password`, `disable`, `restore`, `delete`.
- Allowed roles: `observer`, `clerk`.

- [ ] **Step 1: Write failing source-contract tests**

Assert server-only `auth.admin.createUser`, `updateUserById`, and `deleteUser` usage; reject protected admin mutations; reject role `admin`; never return or store passwords.

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/archive-account-management.test.mjs`

Expected: FAIL because the function does not exist.

- [ ] **Step 3: Implement the Edge Function**

Verify the caller JWT and protected admin profile before all actions. Use `email_confirm: true` on create. Store only profile fields and audit metadata.

- [ ] **Step 4: Build account list UI**

Show email, pen name, role, enabled state, creation time, and actions. Creation and reset dialogs allow password reveal before submission, but never retrieve an old password.

- [ ] **Step 5: Preserve historical attribution**

If submissions or versions exist, disable the Auth user and retain the profile. Permanently delete only history-free accounts.

- [ ] **Step 6: Run focused tests**

Run: `node --test tests/archive-account-management.test.mjs tests/archive-workflow-schema.test.mjs`

Expected: PASS.

---

### Task 10: Full verification and local acceptance

**Files:**
- Modify only if a failing verification exposes a root cause.

- [ ] **Step 1: Run all automated tests**

Run: `npm.cmd test`

Expected: all tests PASS with no skipped tests.

- [ ] **Step 2: Build production assets**

Run: `npm.cmd run build`

Expected: Vite build succeeds; only the existing large-chunk advisory may remain.

- [ ] **Step 3: Start local preview**

Run: `npm.cmd run dev -- --host 127.0.0.1`

Expected: Vite reports a local URL.

- [ ] **Step 4: Exercise the critical admin path**

Verify: admin opens workbench → person card → edits `[data-save]` values → local saved → cloud synced → submits → review formal preview → approve/accession → public old-style archive shows the same section values, version, official/collector, and modifier.

- [ ] **Step 5: Exercise the clerk path**

Verify: clerk performs the same editor/submission path but cannot review or manage accounts.

- [ ] **Step 6: Exercise recovery and amendment**

Verify: interrupted local draft restores; amendment picker loads an existing archive; approval retains archive number and creates a new version.

- [ ] **Step 7: Do not deploy without user approval**

Report local results and any required Supabase migration/Edge Function deployment steps. Production deployment remains a separate confirmed action.

