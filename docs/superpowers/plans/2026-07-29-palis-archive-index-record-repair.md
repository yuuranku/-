# PALIS Archive Index and Record Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Bounded subagents may inspect or implement Tasks 6 and 8 only after Tasks 1–5 are integrated.

**Goal:** Repair all nine archive numbering/index paths, model multiple documents and targeted amendments correctly, remove the 26-event limit, add controlled species/media fields, and finish the PALIS × Win95 workspace without changing the public archive art direction.

**Architecture:** A shared category profile owns numbering floors, abbreviations, index fields, and validation. Published versions carry structured `indexData`; an archive-level projection feeds the nine existing renderers while full documents and targeted amendments remain separate. The local IndexedDB engine and Supabase repository implement one contract, and a transactional migration repairs existing `AUTO:` rows.

**Tech Stack:** Vanilla JavaScript ES modules, Vite, Node test runner, Supabase/PostgreSQL/Storage, IndexedDB, existing PALIS HTML/CSS.

## Global Constraints

- Preserve the nine public layouts, archive windows, animation timings, fonts, PALIS colors, and existing static directory order.
- New database archives append after static archives and receive a manually dismissible `NEW` badge.
- Clerks cannot create stations or White Curtain entrances; administrators can.
- System fields `dossierNo`, `entryCode`, `regDate`, and `clerk` are read-only.
- Do not deploy or apply the remote migration in this implementation session.
- Do not modify or remove unrelated untracked files in `docs/reports/`, `supabase/.temp/`, or `tmp/`.
- Run tests before every implementation commit and complete real-browser local-admin verification before completion.

---

### Task 1: Shared nine-category registration and system-field stamping

**Files:**
- Create: `src/archive-workflow/category-profiles.js`
- Create: `tests/archive-category-profiles.test.mjs`
- Modify: `src/archive-workflow/editor-document.js`
- Modify: `src/archive-workflow/local/local-workflow-engine.js`
- Modify: `tests/archive-editor-document.test.mjs`
- Modify: `tests/local-workflow-engine.test.mjs`

**Interfaces:**
- Produces: `ARCHIVE_CATEGORY_PROFILES`
- Produces: `getArchiveCategoryProfile(category)`
- Produces: `nextArchiveSequence(category, currentValue)`
- Produces: `formatArchiveCategoryCode(category, sequenceNumber)`
- Produces: `formatArchiveFormalNumber(category, sequenceNumber)`
- Produces: `stampArchiveSystemFields(document, { category, sequenceNumber, registeredAt, clerkName })`

- [ ] **Step 1: Write failing category registration tests**

```js
const expected = {
  country: ['N19', '019.REG'],
  organization: ['O25', '025.CHN'],
  station: ['ST21', '021.LOG'],
  entrance: ['EN19', '019.CRD'],
  ecology: ['E08', '008.ECO'],
  person: ['P47', '047.PER'],
  event: ['EV27', '027.RLL'],
  anomaly: ['A26', '026.TRC'],
  species: ['S23', '023.SPC'],
};
for (const [category, [code, formal]] of Object.entries(expected)) {
  const sequence = nextArchiveSequence(category, 0);
  assert.equal(formatArchiveCategoryCode(category, sequence), code);
  assert.equal(formatArchiveFormalNumber(category, sequence), formal);
}
```

Also assert that stamping writes `values.dossierNo`, `values.entryCode`, `values.regDate`, and `values.clerk` without mutating the input document.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test tests/archive-category-profiles.test.mjs tests/archive-editor-document.test.mjs tests/local-workflow-engine.test.mjs`

Expected: FAIL because `category-profiles.js` and baseline-aware allocation do not exist.

- [ ] **Step 3: Implement the category profile**

Define exact profile data:

```js
const definitions = {
  country:      { prefix: 'N',  abbreviation: 'REG', floor: 18, templateCode: '01' },
  organization: { prefix: 'O',  abbreviation: 'CHN', floor: 24, templateCode: '02' },
  station:      { prefix: 'ST', abbreviation: 'LOG', floor: 20, templateCode: '03' },
  entrance:     { prefix: 'EN', abbreviation: 'CRD', floor: 18, templateCode: '04' },
  ecology:      { prefix: 'E',  abbreviation: 'ECO', floor: 7,  templateCode: '05' },
  person:       { prefix: 'P',  abbreviation: 'PER', floor: 46, templateCode: '06' },
  event:        { prefix: 'EV', abbreviation: 'RLL', floor: 26, templateCode: '07' },
  anomaly:      { prefix: 'A',  abbreviation: 'TRC', floor: 25, templateCode: '08' },
  species:      { prefix: 'S',  abbreviation: 'SPC', floor: 22, templateCode: '09' },
};
```

Format numeric suffixes with at least two digits. Update local publication to allocate with `Math.max(storedCounter, profile.floor) + 1`, stamp the immutable version content, and return:

```js
{
  archiveId,
  versionId,
  status: 'published',
  code,
  sequenceNumber,
  abbreviation,
  formalNumber,
  versionLabel,
}
```

Do not seed counters into `createEmptyLocalState`. Apply the floor inside the existing single reducer transaction, after the idempotency lookup and before archive insertion, so duplicate publication returns the original result without consuming a number and every existing failpoint still produces zero committed changes.

- [ ] **Step 4: Run focused tests and verify success**

Run: `node --test tests/archive-category-profiles.test.mjs tests/archive-editor-document.test.mjs tests/local-workflow-engine.test.mjs`

Expected: PASS, including an empty local state producing `S23`, not `S1` or `AUTO:`.

- [ ] **Step 5: Commit**

```powershell
git add -- src/archive-workflow/category-profiles.js src/archive-workflow/editor-document.js src/archive-workflow/local/local-workflow-engine.js tests/archive-category-profiles.test.mjs tests/archive-editor-document.test.mjs tests/local-workflow-engine.test.mjs
git commit -m "feat: register nine archive numbering systems"
```

---

### Task 2: Transactional Supabase repair and repository contract

**Files:**
- Create: `supabase/migrations/202607290002_archive_index_record_repair.sql`
- Modify: `src/archive-workflow/repository-contract.js`
- Modify: `src/archive-workflow/repositories/supabase-repository.js`
- Modify: `src/archive-workflow/local/local-workflow-engine.js`
- Modify: `tests/archive-workflow-schema.test.mjs`
- Modify: `tests/archive-workflow-repository-contract.test.mjs`
- Modify: `tests/archive-workflow-repository-shapes.test.mjs`
- Modify: `tests/supabase-archive-workflow-repository.test.mjs`
- Modify: `tests/helpers/archive-workflow-repository-conformance.mjs`

**Interfaces:**
- Adds repository method: `setArchiveNewBadge(archiveId, visible)`
- Adds repository method: `listArchiveDocuments(archiveId)` returning `{ id, title, kind, latestVersionId, versionLabel, ownerName }[]`
- Adds repository method: `listPublishedMedia(contributionId)` returning `{ id, role, storagePath, publicUrl, altText, caption, sortOrder }[]`
- Extends `uploadAttachment(contributionId, ownerId, file, metadata = {})`
- Extends `listPublishedArchives({ limit = 100, offset = 0 })` so the public directory can read bounded pages without fetching full document bodies.
- Strengthens `publishContribution` result to include the identity fields produced by Task 1.

- [ ] **Step 1: Write failing schema and repository tests**

Assert that the new migration contains:

```sql
alter table public.archives
  add column if not exists index_payload jsonb not null default '{}'::jsonb,
  add column if not exists new_badge_visible boolean not null default false;

alter table public.archive_attachments
  add column if not exists role text,
  add column if not exists caption text,
  add column if not exists alt_text text,
  add column if not exists sort_order integer not null default 0;
```

Assert `publishContribution` sends `p_code: null`, returns `S23`/`023.SPC`, and translates the old “archive code required” failure to `schema_update_required` without inserting an archive.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test tests/archive-workflow-schema.test.mjs tests/archive-workflow-repository-contract.test.mjs tests/archive-workflow-repository-shapes.test.mjs tests/supabase-archive-workflow-repository.test.mjs`

Expected: FAIL on missing migration columns, methods, and publish identity fields.

- [ ] **Step 3: Implement the migration and both repositories**

The migration must:

1. Temporarily move standard-code rows away from conflicting sequence numbers.
2. Reassign rows matching `^(N|O|ST|EN|E|P|EV|A|S)[0-9]+$` to their numeric suffix.
3. Seed each `archive_number_counters.last_value` with at least the Task 1 floor.
4. Allocate every `AUTO:%` row above `greatest(static floor, database maximum)`.
5. Rewrite the code with a two-digit minimum suffix.
6. Replace `publish_archive_contribution` so a new archive accepts `p_code = null`, stores `draft_content.indexData` in `archives.index_payload`, sets `new_badge_visible = true`, stamps the version, and returns all identity fields.
7. Validate that an amendment target belongs to the selected archive.

Implement matching local methods. In the Supabase repository, map storage metadata into `archive_attachments`, create signed read URLs only for published media, and keep the existing 5MB raw-upload guard in addition to the stricter UI image policy.

Update the repository conformance harness explicitly: its historical `template-1`/`events` fixture must be mapped to the formal `event` category for allocation tests instead of weakening production category validation.

- [ ] **Step 4: Run repository conformance and schema tests**

Run: `node --test tests/archive-workflow-schema.test.mjs tests/archive-workflow-repository-contract.test.mjs tests/archive-workflow-repository-shapes.test.mjs tests/supabase-archive-workflow-repository.test.mjs tests/local-workflow-engine.test.mjs`

Expected: PASS for local and Supabase harnesses.

- [ ] **Step 5: Commit**

```powershell
git add -- supabase/migrations/202607290002_archive_index_record_repair.sql src/archive-workflow/repository-contract.js src/archive-workflow/repositories/supabase-repository.js src/archive-workflow/local/local-workflow-engine.js tests/archive-workflow-schema.test.mjs tests/archive-workflow-repository-contract.test.mjs tests/archive-workflow-repository-shapes.test.mjs tests/supabase-archive-workflow-repository.test.mjs tests/helpers/archive-workflow-repository-conformance.mjs
git commit -m "feat: repair archive identities transactionally"
```

---

### Task 3: Category index data, validation, and system-owned editor fields

**Files:**
- Create: `src/archive-workflow/index-fields.js`
- Create: `tests/archive-index-fields.test.mjs`
- Modify: `src/archive-workflow/category-profiles.js`
- Modify: `src/archive-workflow/editor-document.js`
- Modify: `src/archive-workflow/editor-bridge.js`
- Modify: `src/archive-workflow/workspace.js`
- Modify: `src/archive-workflow/workspace.css`
- Modify: `tests/archive-editor-bridge.test.mjs`
- Modify: `tests/clerk-workflow-ui.test.mjs`

**Interfaces:**
- Produces: `normalizeArchiveIndexData(category, input)`
- Produces: `validateArchiveIndexData(category, input)` returning `{ valid, missing, value }`
- Produces: `renderArchiveIndexFields(category, indexData)`
- Editor bridge adds `writeFieldValue(key, value)`, `writeFieldByLabel(label, value)`, and `setSystemFields(fields)`.

- [ ] **Step 1: Write failing index-contract tests**

Use the exact index keys:

```js
const keys = {
  country: ['title', 'archivePeriod', 'bloc'],
  organization: ['title', 'channel', 'foundedAt'],
  station: ['title', 'latitude', 'longitude', 'owner', 'stationType', 'status'],
  entrance: ['title', 'latitude', 'longitude', 'owner', 'entranceType', 'status', 'hazard'],
  ecology: ['title', 'recordType', 'firstObservedAt', 'scope', 'status'],
  person: ['title', 'archiveChain', 'organization', 'role', 'activePeriod', 'status'],
  event: ['title', 'startDate', 'endDate', 'timePrecision', 'location', 'reviewStatus'],
  anomaly: ['title', 'parentEvent', 'occurredAt', 'location', 'anomalyType', 'severity', 'status'],
  species: ['title', 'specimenClass', 'discoveredAt', 'location', 'specimenStatus', 'hazard'],
};
```

Assert species rejects values outside `FLORA|FAUNA|COMPOSITE`, event requires a start date but permits an empty end date, and station/entrance coordinates parse as finite latitude/longitude.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test tests/archive-index-fields.test.mjs tests/archive-editor-bridge.test.mjs tests/clerk-workflow-ui.test.mjs`

Expected: FAIL because the index field module and generated panel do not exist.

- [ ] **Step 3: Implement generated index controls**

Store `indexData` alongside `values`, `sections`, `references`, and `media` without changing `schemaVersion: 2`. Generate the left-rail controls from the category profile and use select controls for enumerations. Synchronize title with `hero`, coordinates with the visible `坐标` field, species class with `植物／动物／复合群落`, and event start time with `发生时期 / PERIOD`.

Before submission:

```js
const validation = validateArchiveIndexData(template.category, editorDocument.indexData);
if (!validation.valid) {
  showIndexErrors(validation.missing);
  focusIndexField(validation.missing[0]);
  return;
}
```

Mark the four system fields read-only in the iframe and show “审核录入时自动生成” until publication.

- [ ] **Step 4: Run editor and workspace tests**

Run: `node --test tests/archive-index-fields.test.mjs tests/archive-editor-document.test.mjs tests/archive-editor-bridge.test.mjs tests/clerk-workflow-ui.test.mjs tests/workspace-ux-regression.test.mjs`

Expected: PASS for all nine generated field sets and controlled species selection.

- [ ] **Step 5: Commit**

```powershell
git add -- src/archive-workflow/index-fields.js src/archive-workflow/category-profiles.js src/archive-workflow/editor-document.js src/archive-workflow/editor-bridge.js src/archive-workflow/workspace.js src/archive-workflow/workspace.css tests/archive-index-fields.test.mjs tests/archive-editor-document.test.mjs tests/archive-editor-bridge.test.mjs tests/clerk-workflow-ui.test.mjs tests/workspace-ux-regression.test.mjs
git commit -m "feat: bind nine editors to index contracts"
```

---

### Task 4: Directory projection, tail ordering, NEW toggle, and nine numbering locations

**Files:**
- Create: `src/archive-workflow/index-projector.js`
- Create: `tests/archive-index-projector.test.mjs`
- Modify: `src/archive-workflow/directory.js`
- Modify: `src/archive-workflow/workspace.js`
- Modify: `src/archive-workflow/workspace.css`
- Modify: `src/main.js`
- Modify: `src/style.css`
- Modify: `tests/archive-publication.test.mjs`
- Modify: `tests/archive-admin-workflow.test.mjs`
- Modify: `tests/archive-directories.test.mjs`

**Interfaces:**
- Produces: `projectPublishedArchive(archive)` returning the renderer-facing archive record.
- Consumes: `archive.index_payload`, `archive.new_badge_visible`, and the identity fields from Task 1.

- [ ] **Step 1: Write failing directory and UI tests**

Assert:

```js
assert.deepEqual(
  mergePublishedArchiveDirectory(base, cloud).find(({ id }) => id === 'species').children.map(({ code }) => code),
  ['S01', 'S02', 'S23', 'S24'],
);
assert.equal(projectPublishedArchive(species).specimenClass, 'FLORA');
assert.equal(projectPublishedArchive(event).year, '1963-08-31');
assert.equal(projectPublishedArchive(newArchive).isNew, true);
```

Add source assertions that every entry receives a common `.archive-new-badge` and the admin archive card contains a `data-toggle-archive-new` control.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test tests/archive-index-projector.test.mjs tests/archive-publication.test.mjs tests/archive-admin-workflow.test.mjs tests/archive-directories.test.mjs`

Expected: FAIL because cloud entries are prepended, projection fields are discarded, and no NEW control exists.

- [ ] **Step 3: Implement projection and UI wiring**

Project category-specific values into the existing renderer properties (`bloc`, `operator`, `lat`, `lng`, `layer`, `system`, `year`, `eventDate`, `severity`, `specimenClass`, `image`). Sort cloud additions by `sequence_number` ascending and append them after static children. Update public-directory synchronization to request 100 archive projections per page until a page returns fewer than 100; never request contribution bodies or evidence images during this loop.

In `appendArchiveEntry` append:

```html
<span class="archive-new-badge" aria-label="新档案">NEW</span>
```

only when `archive.isNew`. In administrator archive management, use `setArchiveNewBadge`, disable the switch while saving, update the card on success, and dispatch `palis:archive-directory-changed`.

Audit all nine renderer code paths so card corner, selected readout, detail title, formal number, and filename use `archive.code` or `formatArchiveFormalNumber`; remove every UUID-derived display fallback.

- [ ] **Step 4: Run directory/admin tests**

Run: `node --test tests/archive-index-projector.test.mjs tests/archive-publication.test.mjs tests/archive-admin-workflow.test.mjs tests/archive-directories.test.mjs tests/palis-runtime.test.mjs`

Expected: PASS with cloud archives at the tail and consistent numbering.

- [ ] **Step 5: Commit**

```powershell
git add -- src/archive-workflow/index-projector.js src/archive-workflow/directory.js src/archive-workflow/workspace.js src/archive-workflow/workspace.css src/main.js src/style.css tests/archive-index-projector.test.mjs tests/archive-publication.test.mjs tests/archive-admin-workflow.test.mjs tests/archive-directories.test.mjs
git commit -m "feat: project new archives into nine directories"
```

---

### Task 5: Independent documents and targeted amendments

**Files:**
- Create: `src/archive-workflow/record-tree.js`
- Create: `tests/archive-record-tree.test.mjs`
- Modify: `src/archive-workflow/workspace.js`
- Modify: `src/archive-workflow/publication.js`
- Modify: `src/archive-workflow/public-renderer.js`
- Modify: `src/archive-workflow/local/local-workflow-engine.js`
- Modify: `src/archive-workflow/repositories/supabase-repository.js`
- Modify: `tests/archive-publication.test.mjs`
- Modify: `tests/clerk-workflow-ui.test.mjs`
- Modify: `tests/local-workflow-engine.test.mjs`

**Interfaces:**
- Produces: `buildArchiveRecordTree({ officialRecord, contributions })`
- Returns: `{ records, amendmentsByTarget, tabs }`
- Consumes: `listArchiveDocuments(archiveId)` from Task 2.

- [ ] **Step 1: Write failing semantic tests**

Given four independent contributions and one amendment targeting record 1:

```js
assert.equal(model.records.length, 4);
assert.equal(model.tabs.length, 4);
assert.equal(model.amendmentsByTarget.get('record-1').length, 1);
assert.doesNotMatch(rendered, /data-contribution-tab="amendment-1"/);
assert.match(rendered, /data-amendment-for="record-1"/);
```

Assert “向现有档案加入新文档” uses the category template URL and starts blank, while “修改现有文档” uses `10-自由修订补充页.html` and requires a selected document.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test tests/archive-record-tree.test.mjs tests/archive-publication.test.mjs tests/clerk-workflow-ui.test.mjs tests/local-workflow-engine.test.mjs`

Expected: FAIL because amendments currently become record tabs and both existing-archive modes use the freeform page/latest record.

- [ ] **Step 3: Implement the record tree and target picker**

Change editor routing:

```js
const editorPreviewUrl = (template, kind) =>
  kind === 'amendment' ? FREEFORM_EDITOR_SOURCE : templatePreviewUrl(template);
```

For `contribution`, select only the upper archive and clear `targetContributionId`/`baseVersionId`. For `amendment`, load `listArchiveDocuments`, show a second select, and set the explicit target/base version. Reject a missing or cross-archive target in both repositories.

Render amendments under the target record with modifier, version, approval date, and freeform content. The ledger mast and tab count count only independent records.

- [ ] **Step 4: Run semantic and publication tests**

Run: `node --test tests/archive-record-tree.test.mjs tests/archive-publication.test.mjs tests/archive-public-renderer.test.mjs tests/clerk-workflow-ui.test.mjs tests/local-workflow-engine.test.mjs tests/supabase-archive-workflow-repository.test.mjs`

Expected: PASS with record 02 retaining its full submitted content and amendments nested under their target.

- [ ] **Step 5: Commit**

```powershell
git add -- src/archive-workflow/record-tree.js src/archive-workflow/workspace.js src/archive-workflow/publication.js src/archive-workflow/public-renderer.js src/archive-workflow/local/local-workflow-engine.js src/archive-workflow/repositories/supabase-repository.js tests/archive-record-tree.test.mjs tests/archive-publication.test.mjs tests/archive-public-renderer.test.mjs tests/clerk-workflow-ui.test.mjs tests/local-workflow-engine.test.mjs
git commit -m "fix: separate archive documents from amendments"
```

---

### Task 6: Expandable event plane and three-way species grouping

**Files:**
- Create: `src/archive-workflow/event-plane-layout.js`
- Create: `tests/archive-event-plane-overflow.test.mjs`
- Modify: `src/main.js`
- Modify: `src/style.css`
- Modify: `tests/event-plane-layout.test.mjs`
- Modify: `tests/archive-directories.test.mjs`

**Interfaces:**
- Produces: `buildEventPlaneLayout(count)` returning `{ items, width, height }`
- Produces: `eventPlaneVisibleCount(layout, camera, viewport)`

- [ ] **Step 1: Write failing layout and grouping tests**

```js
for (const count of [26, 27, 29, 100]) {
  const plane = buildEventPlaneLayout(count);
  assert.equal(plane.items.length, count);
  assert.equal(new Set(plane.items.map(({ x, y }) => `${x}:${y}`)).size, count);
  assert.ok(plane.items.every((item) => item.x + item.width <= plane.width));
  assert.ok(plane.items.every((item) => item.y + item.height <= plane.height));
}
```

Assert source no longer contains `index % EVENT_PLANE_LAYOUT.length` or `EVENT_PLANE_LAYOUT.slice(0, folderButtons.length)`, and species counts/rendering include `COMPOSITE`.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test tests/archive-event-plane-overflow.test.mjs tests/event-plane-layout.test.mjs tests/archive-directories.test.mjs`

Expected: FAIL at 27+ and COMPOSITE.

- [ ] **Step 3: Implement dynamic bounds**

Keep the first 26 layout objects unchanged. Generate overflow rows with five alternating portrait/landscape cards per row and a 160px gutter; derive width/height from the maximum card bounds. Store the generated layout and bounds in `eventPlaneState`; use them for map nodes, reset, camera clamping, minimum scale, viewport indicator, focus, and visible count.

Add species `groupIndexes.COMPOSITE`, a central dual-rail card lane, `COMPOSITE` count/readout, and `.dual` connector/node styles. Keep FLORA left and FAUNA right.

- [ ] **Step 4: Run layout tests**

Run: `node --test tests/archive-event-plane-overflow.test.mjs tests/event-plane-layout.test.mjs tests/archive-directories.test.mjs tests/palis-runtime.test.mjs`

Expected: PASS for 100 unique event positions and all three species classes.

- [ ] **Step 5: Commit**

```powershell
git add -- src/archive-workflow/event-plane-layout.js src/main.js src/style.css tests/archive-event-plane-overflow.test.mjs tests/event-plane-layout.test.mjs tests/archive-directories.test.mjs
git commit -m "fix: expand event and species archive layouts"
```

---

### Task 7: Optimized person and event media slots

**Files:**
- Create: `src/archive-workflow/media.js`
- Create: `tests/archive-media.test.mjs`
- Modify: `src/archive-workflow/editor-document.js`
- Modify: `src/archive-workflow/editor-bridge.js`
- Modify: `src/archive-workflow/workspace.js`
- Modify: `src/archive-workflow/workspace.css`
- Modify: `src/archive-workflow/public-renderer.js`
- Modify: `src/archive-workflow/directory.js`
- Modify: `src/archive-workflow/repositories/supabase-repository.js`
- Modify: `src/archive-workflow/local/local-workflow-engine.js`
- Modify: `tests/archive-public-renderer.test.mjs`
- Modify: `tests/local-indexeddb-browser.test.mjs`

**Interfaces:**
- Produces: `mediaPolicyForCategory(category)`
- Produces: `optimizeArchiveImage(file, { maxEdge: 1600, maxBytes: 819200 })`
- Produces: `normalizeArchiveMedia(media)`

- [ ] **Step 1: Write failing policy and rendering tests**

Assert person accepts exactly one `portrait`, event accepts one `event-cover` plus six `event-evidence`, other categories expose no new slots, invalid MIME/size is rejected, and renderer emits captions/alt text without embedding raw storage paths.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test tests/archive-media.test.mjs tests/archive-public-renderer.test.mjs tests/local-indexeddb-browser.test.mjs`

Expected: FAIL because media policies, optimized upload slots, and public evidence gallery do not exist.

- [ ] **Step 3: Implement media preparation and storage**

Decode with `createImageBitmap`, scale on an offscreen canvas, and reduce WebP quality from `0.82` in `0.07` steps until the result is at most 800KB; reject if it still exceeds the limit at quality `0.40`.

Upload only after a draft ID exists. Replace local `dataUrl` entries with:

```js
{
  attachmentId,
  field: 'photo',
  role: 'portrait',
  storagePath,
  altText,
  caption,
  sortOrder: 0,
}
```

Use Blob storage in IndexedDB local mode. Persist no signed URL: `listPublishedMedia` hydrates a transient `publicUrl` only when a published document opens. Use that transient cover URL for the public person/event index and lazy-load evidence images in the formal renderer.

- [ ] **Step 4: Run media and persistence tests**

Run: `node --test tests/archive-media.test.mjs tests/archive-editor-document.test.mjs tests/archive-public-renderer.test.mjs tests/local-indexeddb-browser.test.mjs tests/supabase-archive-workflow-repository.test.mjs`

Expected: PASS with text drafts preserved when an image fails.

- [ ] **Step 5: Commit**

```powershell
git add -- src/archive-workflow/media.js src/archive-workflow/editor-document.js src/archive-workflow/editor-bridge.js src/archive-workflow/workspace.js src/archive-workflow/workspace.css src/archive-workflow/public-renderer.js src/archive-workflow/directory.js src/archive-workflow/repositories/supabase-repository.js src/archive-workflow/local/local-workflow-engine.js tests/archive-media.test.mjs tests/archive-public-renderer.test.mjs tests/local-indexeddb-browser.test.mjs
git commit -m "feat: add optimized archive media slots"
```

---

### Task 8: PALIS × Win95 completion and local-admin acceptance

**Files:**
- Create: `scripts/verify-archive-repair.mjs`
- Modify: `package.json`
- Modify: `src/archive-workflow/workspace.css`
- Modify: `src/style.css`
- Modify: `tests/workspace-ux-regression.test.mjs`
- Modify: `tests/ui-density.test.mjs`
- Modify: `tests/local-admin-runtime-browser.test.mjs`

**Interfaces:**
- Adds command: `npm run verify:archive-repair`
- Produces local screenshots and a JSON result under ignored `tmp/archive-repair-verification/`.

- [ ] **Step 1: Write failing Win95 and browser acceptance assertions**

Assert active navy/inactive gray titlebars, outset buttons, inset fields, dotted focus, disabled/loading states, NEW switch states, and that public archive baseline selectors remain unchanged.

The browser verification must perform:

```text
new anomaly -> A26
new species -> S23 -> tail -> NEW off/on
new event -> EV27 -> visible and openable
same species -> record 02
record 01 amendment -> nested, record count remains 02
species FLORA/FAUNA/COMPOSITE selection
person portrait and event cover/evidence reload
clerk station/entrance denial
```

- [ ] **Step 2: Run focused checks and verify failure**

Run: `node --test tests/workspace-ux-regression.test.mjs tests/ui-density.test.mjs tests/local-admin-runtime-browser.test.mjs`

Expected: FAIL on the missing visual states and end-to-end command.

- [ ] **Step 3: Finish the hybrid skin and verification script**

Use only existing PALIS variables and Win95 bevel conventions. Limit public `src/style.css` edits to NEW, event overflow, composite species, and media presentation. Keep workspace-specific titlebars, menus, controls, states, and responsive rules in `workspace.css`.

Add:

```json
"verify:archive-repair": "node scripts/verify-archive-repair.mjs"
```

The script starts the loopback local-admin server, runs the flows with the bundled browser, captures desktop and narrow screenshots, writes pass/fail JSON, and always closes the server.

- [ ] **Step 4: Run complete verification**

Run:

```powershell
npm test
npm run build
npm run verify:archive-repair
```

Expected: all tests pass, build succeeds, verification JSON reports every scenario passed, and no production network write occurs.

- [ ] **Step 5: Run UI skills and commit**

Run the `ui-checker` inspection on the generated screenshots. Use the approved PALIS × Win95 direction from `ui-ux-pro-max`; fix only concrete workspace issues found. Re-run Step 4, then:

```powershell
git add -- package.json scripts/verify-archive-repair.mjs src/archive-workflow/workspace.css src/style.css tests/workspace-ux-regression.test.mjs tests/ui-density.test.mjs tests/local-admin-runtime-browser.test.mjs
git commit -m "feat: complete PALIS Win95 archive workflow"
```

---

## Final completion gate

- [ ] Run `git status --short` and confirm only the user's pre-existing untracked paths remain.
- [ ] Run `npm test`, `npm run build`, and `npm run verify:archive-repair` once more from a clean process.
- [ ] Inspect the verification screenshots at original resolution.
- [ ] Report the migration filename clearly and state that it has not been applied remotely.
- [ ] Do not claim production is fixed until the migration is explicitly applied and verified in Supabase.
