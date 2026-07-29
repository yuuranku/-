# PALIS Clerk Native Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the clerk workbench's iframe/A4 editor with nine simplified, category-specific native forms while preserving the current draft → review → accession → publication workflow.

**Architecture:** Keep `EditorDocument v2` as the only saved document format and add a pure native-form profile/adapter layer that renders and serializes all nine forms without dropping legacy values. Refactor the workbench to select a category or an existing source record, dock the native editor on the right, and reuse the existing autosave, reference, media, review, and publication paths. Extend the exact-source read path and publication projection so an amendment always opens the intended published record and its updated directory fields become public after the existing approval/accession flow.

**Tech Stack:** Vite 7, vanilla ES modules, DOM/CSS, Node `node:test`, IndexedDB local workflow engine, Supabase RPC/migrations, Puppeteer browser verification.

## Global Constraints

- Keep the existing status machine and call order: draft/changes_requested → submitted → approved or changes_requested → existing formal accession → published.
- Do not add a second document schema or database table for native forms; persist through `EditorDocument v2` (`values`, `indexData`, `sections`, `fieldLabels`, `references`, `media`).
- Clerk desktop primary actions are exactly `新增档案` and `修改档案`; folded drafts and returned reasons must be reachable from modification, not lost.
- All nine categories (`country`, `organization`, `station`, `entrance`, `ecology`, `person`, `event`, `anomaly`, `species`) permit clerk creation and modification.
- New forms must not render a new English/foreign-name field; existing legacy values, including English values, must remain editable and survive a save/submit round trip.
- Preserve “加入引用档案”, attachments, media, autosave, local recovery, returned-review copy, and current system-generated submission/formal metadata.
- Native editor must not mount `public/templates/*.html`, `10-自由修订补充页.html`, an iframe, or the old multi-section horizontal navigation.
- Desktop icon glyphs are 56–64px and their click targets are at least 96×96px. The native editor is right-docked, one vertical scroll area, `width: clamp(560px, 34vw, 680px)`, and must remain usable on narrow screens.
- Supabase is the cross-account workflow path. LOCAL/IndexedDB remains an explicitly labeled single-machine demo only.
- Use no new runtime dependency; preserve public archive browsing and the current administrator review/accession behavior.

---

## File Structure

- Create `src/archive-workflow/native-form-profiles.js`: nine form definitions plus pure EditorDocument ↔ native-form-state adapters and validation.
- Create `src/archive-workflow/official-archive-source.js`: turns an existing static official archive source into a nonblank v2 baseline when the database has no authored version.
- Modify `src/archive-workflow/workspace.js`: replace iframe editing with native DOM rendering, move returned drafts into modification selection, target the precise archive source, and support right docking.
- Modify `src/archive-workflow/workspace.css`: native form layout, right docking, one scroll container, and narrow-screen behavior.
- Modify `index.html` and `src/style.css`: two large clerk actions and matching desktop/start-menu icon treatment.
- Modify `src/archive-workflow/archive-cabinet.js`, `src/archive-workflow/local/local-workflow-engine.js`, `src/archive-workflow/repository-contract.js`, and `src/archive-workflow/repositories/supabase-repository.js`: remove the old two-category restriction and load an exact immutable edit baseline.
- Create `supabase/migrations/202607290004_clerk_native_editor_sources.sql`: secure exact editor-source RPC plus amendment index projection repair.
- Modify workflow tests and add `tests/native-form-profiles.test.mjs` plus `tests/clerk-native-editor-browser.test.mjs`.

### Task 1: Define the nine native form profiles and lossless document adapter

**Files:**
- Create: `src/archive-workflow/native-form-profiles.js`
- Create: `tests/native-form-profiles.test.mjs`
- Modify: `tests/archive-category-profiles.test.mjs`

**Interfaces:**
- Consumes: `ARCHIVE_TEMPLATES`, `getArchiveCategoryProfile(category)`, `createEditorDocument(template, values, extras)`, and `normalizeEditorDocument(document)`.
- Produces:
  ```js
  export const NATIVE_FORM_PROFILES;
  export const getNativeFormProfile = (templateOrCategory) => profile;
  export const readNativeFormState = (template, document) => ({ indexData, body, optional, customEntries, legacyFields, references, media });
  export const writeNativeFormDocument = (template, state, priorDocument = {}) => editorDocument;
  export const renderNativeArchiveForm = (profile, document, options = {}) => html;
  export const readNativeArchiveForm = (form, profile, priorDocument = {}) => editorDocument;
  export const writeNativeArchiveForm = (form, profile, document) => void;
  export const validateNativeFormState = (profile, state) => ({ valid, errors });
  ```
- Each profile has `{ category, templateCode, indexFields, coreFields, optionalFields, defaults }`. `coreFields` must be distinct for every category and must not contain an English-name field.

  | Category | Required index fields | Required core fields |
  | --- | --- | --- |
  | country | `title`, `archivePeriod`, `bloc` | `countryOverview` |
  | organization | `title`, `channel`, `foundedAt` | `organizationRole` |
  | station | `title`, `latitude`, `longitude`, `owner`, `stationType`, `status` | `stationOverview` |
  | entrance | `title`, `latitude`, `longitude`, `owner`, `entranceType`, `status`, `hazard` | `transitRiskSummary` |
  | ecology | `title`, `recordType`, `firstObservedAt`, `scope`, `status` | `ecologyProfile`, `observationSummary` |
  | person | `title`, `archiveChain`, `organization`, `role`, `activePeriod`, `status` | `roleRelation`, `careerSummary` |
  | event | `title`, `startDate`, `timePrecision`, `location`; set `reviewStatus` automatically | `eventOverview`, `evidenceSummary` |
  | anomaly | `title`, `parentEvent`, `occurredAt`, `location`, `anomalyType`, `severity`; set `status` automatically | `observationEvidence` |
  | species | `title`, `specimenClass`, `discoveredAt`, `location`, `specimenStatus`, `hazard` | `featureDiscoveryRisk` |

- [ ] **Step 1: Write the failing profile and round-trip tests**

  ```js
  import {
    getNativeFormProfile,
    readNativeFormState,
    writeNativeFormDocument,
  } from '../src/archive-workflow/native-form-profiles.js';

  test('nine native forms keep their own required index and core content', () => {
    assert.equal(Object.keys(NATIVE_FORM_PROFILES).length, 9);
    assert.deepEqual(getNativeFormProfile('station').indexFields.map(({ key }) => key),
      ['title', 'latitude', 'longitude', 'owner', 'stationType', 'status']);
    assert.deepEqual(getNativeFormProfile('station').coreFields.map(({ key }) => key),
      ['stationOverview']);
    assert.ok(getNativeFormProfile('anomaly').coreFields.some(({ key }) => key === 'observationEvidence'));
    for (const profile of Object.values(NATIVE_FORM_PROFILES)) {
      assert.equal(profile.coreFields.some(({ key }) => /english|foreign|英文|外文/i.test(key)), false);
    }
  });

  test('native state retains unknown legacy values, references, media, and multiple custom entries', () => {
    const before = createEditorDocument(template03, {
      hero: '南极站',
      legacy: '旧字段不能丢',
      'custom:item:one:title': '气象补记',
      'custom:item:one:content': '旧的补充内容',
    }, { indexData: { title: '南极站', latitude: '-70', longitude: '10', owner: 'PALIS', stationType: '科考', status: '运行' }, references: [{ archiveId: 'a-1', code: 'EV27', label: '母事件' }], media: [{ id: 'm-1' }] });
    const state = readNativeFormState(template03, before);
    state.body.stationOverview = '新的站点概述';
    state.customEntries.push({ id: 'two', title: '新补记', content: '新的补充内容' });
    const after = writeNativeFormDocument(template03, state, before);
    assert.equal(after.values.legacy, '旧字段不能丢');
    assert.equal(after.values['custom:item:two:content'], '新的补充内容');
    assert.deepEqual(after.references, before.references);
    assert.deepEqual(after.media, before.media);
  });
  ```

- [ ] **Step 2: Run the focused test to verify it fails**

  Run: `node --test tests/native-form-profiles.test.mjs`

  Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `native-form-profiles.js`.

- [ ] **Step 3: Implement the minimal lossless adapter**

  ```js
  export const getNativeFormProfile = (templateOrCategory) => {
    const category = typeof templateOrCategory === 'string'
      ? templateOrCategory
      : templateOrCategory?.category;
    const profile = NATIVE_FORM_PROFILES[category];
    if (!profile) throw new RangeError(`Unknown native archive category: ${category || '(empty)'}`);
    return profile;
  };

  export const writeNativeFormDocument = (template, state, priorDocument = {}) => {
    const profile = getNativeFormProfile(template);
    const prior = normalizeEditorDocument({ ...priorDocument, templateCode: template.code });
    const values = { ...prior.values };
    for (const field of [...profile.coreFields, ...profile.optionalFields]) {
      values[field.storageKey] = String(state[field.section]?.[field.key] ?? '');
    }
    for (const item of state.customEntries) {
      values[`custom:item:${item.id}:title`] = item.title;
      values[`custom:item:${item.id}:content`] = item.content;
    }
    return normalizeEditorDocument({ ...prior, templateCode: template.code, category: template.category,
      title: state.indexData.title, values, indexData: { ...prior.indexData, ...state.indexData },
      references: state.references, media: state.media, sections: buildNativeSections(profile, prior, values) });
  };
  ```

  Implement `renderNativeArchiveForm` from the profile table, `writeNativeArchiveForm` by assigning each `input`/`textarea` from `readNativeFormState`, and `readNativeArchiveForm` by reading its controls then calling `writeNativeFormDocument`. Put all unrecognized prior `values` into the rendered `原有补充资料` list without deleting them. Seed event `reviewStatus: '待审核'` and anomaly `status: '待审核'` only for new state.

- [ ] **Step 4: Run focused and neighboring profile tests**

  Run: `node --test tests/native-form-profiles.test.mjs tests/archive-category-profiles.test.mjs`

  Expected: PASS; all nine profile definitions expose their specific required fields, and legacy/custom/reference/media round trips are lossless.

- [ ] **Step 5: Commit the adapter**

  ```bash
  git add src/archive-workflow/native-form-profiles.js tests/native-form-profiles.test.mjs tests/archive-category-profiles.test.mjs
  git commit -m "feat: add native clerk form profiles"
  ```

### Task 2: Permit all nine clerk categories and repair published index projection

**Files:**
- Modify: `src/archive-workflow/archive-cabinet.js`
- Modify: `src/archive-workflow/local/local-workflow-engine.js:118-143, 575-640`
- Modify: `src/archive-workflow/workspace.js:365-395, 659-690, 850-890, 1380-1420`
- Modify: `supabase/migrations/202607290004_clerk_native_editor_sources.sql`
- Modify: `tests/archive-cabinet.test.mjs`
- Modify: `tests/clerk-workflow-ui.test.mjs`
- Modify: `tests/local-workflow-engine.test.mjs`
- Modify: `tests/archive-workflow-schema.test.mjs`

**Interfaces:**
- Consumes: existing `saveDraft`, `submitDraft`, `reviewSubmission`, and `publishContribution` contracts.
- Produces: clerk-created station/entrance records behave like every other category; publication of a new record or an amendment updates `archives.title`, `archives.summary`, and `archives.index_payload` from the approved draft without changing category or archive identity.

- [ ] **Step 1: Write failing authorization and projection tests**

  ```js
  test('a clerk can create station and entrance drafts', async () => {
    for (const templateId of ['03', '04']) {
      const saved = await harness.repository.saveDraft(makeDraft({ templateId, kind: 'new', archiveId: null }));
      assert.equal(saved.status, 'draft');
    }
  });

  test('publishing an amendment updates the existing archive directory projection', async () => {
    await harness.seed(createApprovedAmendmentState({
      indexData: { title: '新站名', latitude: '-71.2', longitude: '12.4', owner: 'PALIS', stationType: '观测', status: '封存' },
    }));
    await harness.repository.publishContribution('submission-1', registrationFor('station'));
    const [archive] = await harness.repository.listPublishedArchives();
    assert.equal(archive.title, '新站名');
    assert.equal(archive.index_payload.longitude, '12.4');
  });
  ```

- [ ] **Step 2: Run the focused tests to verify they fail**

  Run: `node --test tests/archive-cabinet.test.mjs tests/local-workflow-engine.test.mjs tests/archive-workflow-schema.test.mjs`

  Expected: FAIL because the clerk restriction rejects `03`/`04` and amendment publication leaves `index_payload` unchanged.

- [ ] **Step 3: Remove only the obsolete restriction and update both publication paths**

  Delete `FIXED_FOR_CLERK` behavior in `archive-cabinet.js`, the station/entrance branch in `resolveDraftClassification`, and `isFixedArchiveCategory` coercion in the workbench. In the local existing-archive branch, update the projection and archive atomically:

  ```js
  const indexPayload = clone(contribution.draft_content?.indexData ?? archive.index_payload ?? {});
  archive.title = String(indexPayload.title ?? projection.title ?? archive.title);
  archive.summary = projection.summary;
  archive.index_payload = indexPayload;
  ```

  In the new SQL migration, `create or replace function public.publish_archive_contribution(...)` from the prior migration and, in its existing-archive branch, apply:

  ```sql
  title = coalesce(nullif(v_contribution.draft_content -> 'indexData' ->> 'title', ''), title),
  summary = coalesce(nullif(v_contribution.draft_content ->> 'summary', ''), summary),
  index_payload = case
    when jsonb_typeof(v_contribution.draft_content -> 'indexData') = 'object'
      then v_contribution.draft_content -> 'indexData'
    else index_payload
  end
  ```

  Preserve the original category, code, sequence number, visibility, version history, review/audit writes, and idempotency behavior.

- [ ] **Step 4: Run authorization, publication, and schema checks**

  Run: `node --test tests/archive-cabinet.test.mjs tests/local-workflow-engine.test.mjs tests/archive-workflow-schema.test.mjs`

  Expected: PASS; all nine clerk categories can start a new draft and an approved amendment updates title/index payload only at publication.

- [ ] **Step 5: Commit the policy/projection repair**

  ```bash
  git add src/archive-workflow/archive-cabinet.js src/archive-workflow/local/local-workflow-engine.js supabase/migrations/202607290004_clerk_native_editor_sources.sql tests/archive-cabinet.test.mjs tests/local-workflow-engine.test.mjs tests/archive-workflow-schema.test.mjs
  git commit -m "fix: allow all clerk archive categories and refresh index projection"
  ```

### Task 3: Load the exact archive record for modification, including official-source fallback

**Files:**
- Create: `src/archive-workflow/official-archive-source.js`
- Modify: `src/archive-workflow/repository-contract.js`
- Modify: `src/archive-workflow/local/local-workflow-engine.js:1077-1097`
- Modify: `src/archive-workflow/repositories/supabase-repository.js:323-340`
- Modify: `supabase/migrations/202607290004_clerk_native_editor_sources.sql`
- Modify: `tests/archive-workflow-repository-contract.test.mjs`
- Modify: `tests/archive-workflow-repository-shapes.test.mjs`
- Modify: `tests/local-workflow-engine.test.mjs`
- Modify: `tests/supabase-archive-workflow-repository.test.mjs`

**Interfaces:**
- Consumes: `listArchiveDocuments(archiveId)` choices `{ id, latestVersionId, versionLabel }`, existing archive data, and static archive root content.
- Produces:
  ```js
  loadArchiveEditorSource(archiveId, {
    contributionId = null,
    versionId = null,
    officialBase = false,
  } = {}) => Promise<{
    archiveId, contributionId, versionId,
    sourceKind: 'document' | 'official-amendment' | 'official-static',
    content, archive, references, mediaContributionId, version
  } | null>
  ```
  `content` is immutable/nonblank for a selected document. An official static source is converted by `toEditorDocumentFromOfficialArchive(archive, staticRoot, template)` before the editor opens.

- [ ] **Step 1: Write failing exact-selection and nonblank-fallback tests**

  ```js
  test('loadArchiveEditorSource honors the selected document and base version', async () => {
    await harness.seed(twoDocumentsAndLaterAmendment());
    const source = await harness.repository.loadArchiveEditorSource('archive-1', {
      contributionId: 'document-a', versionId: 'version-a2',
    });
    assert.equal(source.contributionId, 'document-a');
    assert.equal(source.versionId, 'version-a2');
    assert.equal(source.content.values.hero, 'A 的正文');
  });

  test('official static fallback creates a readable v2 baseline instead of a blank form', () => {
    const source = toEditorDocumentFromOfficialArchive(officialArchive, staticRoot, template03);
    assert.equal(source.indexData.title, officialArchive.title);
    assert.match(source.values['legacy:official-body'], /科考站/);
  });
  ```

- [ ] **Step 2: Run source tests to verify they fail**

  Run: `node --test tests/archive-workflow-repository-contract.test.mjs tests/archive-workflow-repository-shapes.test.mjs tests/local-workflow-engine.test.mjs tests/supabase-archive-workflow-repository.test.mjs`

  Expected: FAIL because the current reader chooses the archive-wide newest version and has no official static adapter.

- [ ] **Step 3: Implement targeted reader semantics and the secure cloud RPC**

  In local and Supabase repository methods, select exactly the requested contribution/version when supplied; retain the previous archive-wide latest behavior only when no selection is supplied for backward compatibility. Extend the contract assertion to require the old four fields and validate optional `sourceKind`, `archive`, `references`, `mediaContributionId`, and `version` when present.

  Add `public.load_archive_editor_source(p_archive_id uuid, p_contribution_id uuid default null, p_version_id uuid default null, p_official_base boolean default false)` to the new migration. It must authenticate an enabled clerk/admin, reject offline archives, verify that the selected contribution and version belong to the archive and are published, return exact v2 content, resolve fresh reference cards from `archives`, and select the latest published official amendment before returning `official-static`. Grant it to `authenticated` only and revoke it from `anon`.

  Make `official-archive-source.js` map the existing static public record source (`archive-data.js`, `hz6-web-content.js`, and `new-settings-web-content.js`) into `EditorDocument v2`, putting untouched static detail in `legacy:official-body` and preserving archive title/index payload. It must throw a descriptive error if the selected official archive has no matching static root; callers must show retry/error, never create an empty amendment.

- [ ] **Step 4: Run source and immutable-view tests**

  Run: `node --test tests/archive-workflow-repository-contract.test.mjs tests/archive-workflow-repository-shapes.test.mjs tests/local-workflow-engine.test.mjs tests/supabase-archive-workflow-repository.test.mjs`

  Expected: PASS; a selected record cannot be replaced by a newer sibling, references are returned as cards, and official content is never silently replaced by a blank form.

- [ ] **Step 5: Commit the source-loading path**

  ```bash
  git add src/archive-workflow/official-archive-source.js src/archive-workflow/repository-contract.js src/archive-workflow/local/local-workflow-engine.js src/archive-workflow/repositories/supabase-repository.js supabase/migrations/202607290004_clerk_native_editor_sources.sql tests/archive-workflow-repository-contract.test.mjs tests/archive-workflow-repository-shapes.test.mjs tests/local-workflow-engine.test.mjs tests/supabase-archive-workflow-repository.test.mjs
  git commit -m "feat: load exact archive sources for clerk modifications"
  ```

### Task 4: Replace the clerk desktop entry points without stranding returned drafts

**Files:**
- Modify: `index.html:257-321`
- Modify: `src/archive-workflow/workspace.js:1985-2070, 2663-2768`
- Modify: `tests/clerk-workspace.test.mjs`
- Modify: `tests/clerk-workflow-ui.test.mjs`

**Interfaces:**
- Consumes: `ARCHIVE_TEMPLATES`, `client.listMyDrafts(ownerId)`, `client.listEditableArchives({ category })`, `client.listArchiveDocuments(archiveId)`, and the Task 3 source reader.
- Produces: `openNewArchiveChooser()`, `openModifyArchiveChooser()`, and `buildAmendmentInitialState(archive, documentChoice, source)` in `workspace.js`; each creates an editor only after a specific category/template is selected. `openModifyArchiveChooser()` opens returned/draft records first, then published archive records and their exact document choices.

- [ ] **Step 1: Write failing desktop-command and returned-draft tests**

  ```js
  test('clerk desktop exposes only new and modify as primary archive actions', () => {
    assert.match(html, /data-workspace-command="new-archive"/);
    assert.match(html, /data-workspace-command="modify-archive"/);
    assert.doesNotMatch(clerkDesktopMarkup, /data-workspace-command="drafts"|data-workspace-command="inbox"|data-workspace-command="assistant"/);
  });

  test('modify selection includes a returned draft and keeps the review reason', () => {
    assert.match(workspace, /openModifyArchiveChooser/);
    assert.match(workspace, /changes_requested/);
    assert.match(workspace, /data-open-returned-draft/);
  });
  ```

- [ ] **Step 2: Run UI source tests to verify they fail**

  Run: `node --test tests/clerk-workspace.test.mjs tests/clerk-workflow-ui.test.mjs`

  Expected: FAIL because the old desktop exposes cabinet/drafts/inbox/assistant and no new/modify chooser exists.

- [ ] **Step 3: Implement the two-action selection flow**

  Replace clerk-only desktop and start-menu commands with `new-archive` and `modify-archive`; retain admin review/archive/account commands behind `data-admin-only`. `openNewArchiveChooser()` renders all nine templates as large choices and calls `createEditor(template, { kind: 'new' })` only after choosing one. `openModifyArchiveChooser()` loads the clerk's `draft`/`changes_requested` rows first, shows any returned review copy, then lets the user choose category → archive → document; its successful selection calls:

  ```js
  const source = await client.loadArchiveEditorSource(archive.id, {
    contributionId: selectedDocument.id,
    versionId: selectedDocument.latestVersionId,
    officialBase: selectedDocument.id === `official:${archive.id}`,
  });
  if (!source) throw new Error('未找到可修改的档案正文，请重试');
  await createEditor(template, buildAmendmentInitialState(archive, selectedDocument, source));
  ```

  Keep `openDraftsPanel` as an internal helper or replace it with this chooser path; do not leave a clerk route that can only reopen an old iframe editor.

- [ ] **Step 4: Run selection tests**

  Run: `node --test tests/clerk-workspace.test.mjs tests/clerk-workflow-ui.test.mjs`

  Expected: PASS; clerk sees exactly two primary actions, all nine types can be chosen for new records, and returned drafts remain reopenable from modification.

- [ ] **Step 5: Commit the entry-point refactor**

  ```bash
  git add index.html src/archive-workflow/workspace.js tests/clerk-workspace.test.mjs tests/clerk-workflow-ui.test.mjs
  git commit -m "feat: streamline clerk archive entry points"
  ```

### Task 5: Render and serialize the right-docked native editor while retaining workflow behavior

**Files:**
- Modify: `src/archive-workflow/workspace.js:1-1983`
- Modify: `src/archive-workflow/workspace.css`
- Modify: `tests/clerk-workflow-ui.test.mjs`
- Modify: `tests/archive-autosave.test.mjs`
- Modify: `tests/archive-target-documents.test.mjs`

**Interfaces:**
- Consumes: `renderNativeArchiveForm(profile, document, options)`, `readNativeArchiveForm(root, profile, priorDocument)`, and `validateNativeArchiveForm(profile, state)` from Task 1; Task 3 `source` records; existing `submitDraftWithArchiveMedia`, autosave, reference search, and media/attachment renderers.
- Produces: `createEditor(template, initial)` opens `.archive-editor-window.is-docked-right` with a native form. `collectDraft()` still returns the same `editorDraft` shape and the existing submit/review/publish code remains its consumer.

- [ ] **Step 1: Write failing native-editor source assertions**

  ```js
  test('clerk editor uses a native single-scroll form and not an external template frame', () => {
    assert.match(workspace, /renderNativeArchiveForm/);
    assert.match(workspace, /readNativeArchiveForm/);
    assert.match(workspace, /data-native-custom-entry/);
    assert.match(workspace, /data-reference-search/);
    assert.doesNotMatch(workspace, /createTemplateEditorBridge/);
    assert.doesNotMatch(workspace, /data-template-editor-frame/);
    assert.doesNotMatch(workspace, /FREEFORM_AMENDMENT_TEMPLATE/);
    assert.doesNotMatch(workspace, /data-editor-outline/);
  });

  test('submission still uses the existing media-aware workflow function', () => {
    assert.match(workspace, /submitDraftWithArchiveMedia/);
    assert.match(workspace, /client\.reviewSubmission/);
    assert.match(workspace, /client\.publishContribution/);
  });
  ```

- [ ] **Step 2: Run focused editor tests to verify they fail**

  Run: `node --test tests/clerk-workflow-ui.test.mjs tests/archive-autosave.test.mjs tests/archive-target-documents.test.mjs`

  Expected: FAIL because the current editor imports `editor-bridge.js`, mounts `data-template-editor-frame`, and exposes the old outline/kind selector.

- [ ] **Step 3: Replace only the UI adapter inside `createEditor`**

  Remove the workbench import/use of `createTemplateEditorBridge`, `templatePreviewUrl`, `FREEFORM_AMENDMENT_TEMPLATE`, `editorPreviewUrl`, iframe load handling, slash-inside-iframe hooks, and multi-section outline. Keep `draftContentToEditorDocument()` as the legacy-to-v2 ingress. Task 2 has already removed the obsolete station/entrance creation coercion; do not restore it.

  Render one sticky-toolbar / one scroll-body / sticky-footer native DOM form. Its scroll body has: `目录与识别`, category-specific `核心档案内容`, `更多资料` with references/media/attachments, repeatable `自定义标题 + 内容`, and a collapsible editable `原有补充资料`. Show generated submission/formal/version/author values as `<output>` only. Use `readNativeArchiveForm(form, profile, editorDocument)` inside `collectDraft()` and `writeNativeArchiveForm(form, profile, editorDocument)` in `populateDraft()`; never replace `editorDocument` with a blank object on source/read failure.

  Preserve current reference behavior by retaining `renderReferenceList`, reference searching/add/remove handlers, and public-reference card buttons. Preserve `submitDraftWithArchiveMedia`, `client.submitDraft`, `client.reviewSubmission`, `client.publishContribution`, autosave, local recovery, attachments, media, and post-submit read-only state. Hide `contribution` as a clerk UI choice: new forms submit `kind: 'new'`, modifications submit `kind: 'amendment'`; leave backend compatibility for older rows intact.

- [ ] **Step 4: Run editor, autosave, and target-document tests**

  Run: `node --test tests/clerk-workflow-ui.test.mjs tests/archive-autosave.test.mjs tests/archive-target-documents.test.mjs tests/archive-workspace-media.test.mjs`

  Expected: PASS; no workbench iframe remains, references/media/autosave still serialize, and a selected target contributes immutable target/base IDs to the amendment draft.

- [ ] **Step 5: Commit the native editor conversion**

  ```bash
  git add src/archive-workflow/workspace.js src/archive-workflow/workspace.css tests/clerk-workflow-ui.test.mjs tests/archive-autosave.test.mjs tests/archive-target-documents.test.mjs tests/archive-workspace-media.test.mjs
  git commit -m "feat: replace clerk iframe editor with native forms"
  ```

### Task 6: Dock the editor and resize the two clerk desktop actions

**Files:**
- Modify: `src/archive-workflow/workspace.js:492-643`
- Modify: `src/archive-workflow/workspace.css`
- Modify: `src/style.css`
- Modify: `tests/clerk-workspace.test.mjs`
- Modify: `tests/workspace-narrow-controls.test.mjs`
- Modify: `tests/workspace-ux-regression.test.mjs`

**Interfaces:**
- Consumes: `createWindow({ key, title, code, body, className, icon, dock })`.
- Produces: `dock: 'right'` sets `.is-docked-right`, skips centered bounds, cannot drag/maximize into a broken restored state, and preserves existing behavior for non-editor windows.

- [ ] **Step 1: Write failing geometry and desktop-density tests**

  ```js
  test('native editor declares a fixed right-dock presentation', () => {
    assert.match(workspace, /dock:\s*'right'/);
    assert.match(styles, /\.archive-editor-window\.is-docked-right/);
    assert.match(styles, /width:\s*clamp\(560px,\s*34vw,\s*680px\)/);
    assert.match(styles, /right:\s*0/);
  });

  test('clerk desktop icon target and glyph are readable', () => {
    assert.equal(declaration('.clerk-desktop__icons button', 'min-width'), '96px');
    assert.equal(declaration('.clerk-desktop__icons button', 'min-height'), '96px');
    assert.equal(declaration('.clerk-desktop__icon', 'width'), '60px');
    assert.equal(declaration('.clerk-desktop__icon', 'height'), '60px');
  });
  ```

- [ ] **Step 2: Run layout tests to verify they fail**

  Run: `node --test tests/clerk-workspace.test.mjs tests/workspace-narrow-controls.test.mjs tests/workspace-ux-regression.test.mjs`

  Expected: FAIL because editor windows are centered/drag-enabled and final icon CSS still overrides glyphs to 32px and targets to 72px.

- [ ] **Step 3: Implement right docking and responsive CSS**

  Add `dock = null` to `createWindow`; on `dock === 'right'`, add the class and skip the center `left/top` assignment. In drag/maximize listeners, return for `is-docked-right`; do not persist/restores bounds for it. Add:

  ```css
  .archive-editor-window.is-docked-right {
    top: 0;
    right: 0;
    left: auto;
    width: clamp(560px, 34vw, 680px);
    height: 100%;
    max-width: calc(100vw - 12px);
  }
  .archive-editor__scroll { min-height: 0; overflow: auto; }
  @media (max-width: 760px) {
    .archive-editor-window.is-docked-right { inset: 0; width: auto; max-width: none; }
  }
  ```

  Make final desktop CSS values `96px` click targets and `60px` icon dimensions, with two primary clerk buttons in a compact first column; do not alter taskbar/session behavior.

- [ ] **Step 4: Run geometry and narrow-screen tests**

  Run: `node --test tests/clerk-workspace.test.mjs tests/workspace-narrow-controls.test.mjs tests/workspace-ux-regression.test.mjs`

  Expected: PASS; the docked form is vertical and one-scroll, normal windows retain their behavior, and narrow viewport controls are reachable.

- [ ] **Step 5: Commit visual layout changes**

  ```bash
  git add src/archive-workflow/workspace.js src/archive-workflow/workspace.css src/style.css tests/clerk-workspace.test.mjs tests/workspace-narrow-controls.test.mjs tests/workspace-ux-regression.test.mjs
  git commit -m "feat: dock native editor and enlarge clerk actions"
  ```

### Task 7: Validate the complete clerk-to-admin workflow in a real browser

**Files:**
- Create: `tests/clerk-native-editor-browser.test.mjs`
- Modify: `tests/local-admin-runtime-browser.test.mjs`
- Modify: `scripts/verify-local-admin.mjs` only if its current readiness selector cannot identify the native editor

**Interfaces:**
- Consumes: real Vite build/server, local admin runtime fixture, public DOM selectors from Tasks 4–6.
- Produces: deterministic browser coverage for new → submit → approve → accession/published directory, returned modification, exact prefill, repeatable custom fields, references, source-load error state, and desktop geometry.

- [ ] **Step 1: Write the failing browser scenario**

  ```js
  test('clerk native editor preserves a modified archive through review and publication', async (t) => {
    const { page } = await openLocalAdminBrowser(t); // helper starts `startPalisTestServer` and closes browser/server in t.after
    const setValue = (selector, value) => page.$eval(selector, (control, next) => {
      control.value = next;
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
    await page.click('[data-workspace-command="new-archive"]');
    await page.click('[data-template-code="03"]');
    await setValue('[name="index.latitude"]', '-71.2');
    await setValue('[name="body.stationOverview"]', '新的原生站点概述');
    await page.click('[data-add-native-custom-entry]');
    await setValue('[name="custom.two.title"]', '补记');
    await page.click('[data-submit-review]');
    await approveAndPublishCurrentSubmission(page);
    await page.click('[data-workspace-command="modify-archive"]');
    await chooseArchiveDocument(page, 'ST21', '最新正文');
    assert.equal(await page.$eval('[name="body.stationOverview"]', (control) => control.value), '新的原生站点概述');
    assert.equal((await page.$$('iframe[data-template-editor-frame]')).length, 0);
  });
  ```

- [ ] **Step 2: Run browser test to verify it fails**

  Run: `node --test tests/clerk-native-editor-browser.test.mjs`

  Expected: FAIL because selectors/native form behavior do not exist before Tasks 4–6.

- [ ] **Step 3: Make selectors and behavior deterministic without weakening the product**

  Add stable semantic `data-*` selectors to native form controls, chooser rows, source-load error/retry panel, review submit, and admin approval/accession actions. Assert a failed source read retains chooser selection and shows `[data-editor-source-retry]`; do not introduce any test-only runtime flag. Label the local runtime’s workflow badge as `本机演示` while keeping Supabase wording as the cross-account path.

- [ ] **Step 4: Run browser, local, build, and full unit suite**

  Run: `node --test tests/clerk-native-editor-browser.test.mjs tests/local-admin-runtime-browser.test.mjs && npm.cmd test && npm.cmd run build && npm.cmd run verify:local-admin`

  Expected: PASS; browser confirms no iframe/A4/navigator, exact modification prefill, references/custom content, approve/return/publish flow, right dock width, and no regression in local-admin verification.

- [ ] **Step 5: Commit verified acceptance coverage**

  ```bash
  git add tests/clerk-native-editor-browser.test.mjs tests/local-admin-runtime-browser.test.mjs scripts/verify-local-admin.mjs
  git commit -m "test: cover native clerk archive workflow"
  ```

### Task 8: Perform final visual review and reconcile regression baselines intentionally

**Files:**
- Modify only intentional baseline/verification artifacts after reviewing generated output; do not stage unrelated `tmp/`, `.superpowers/brainstorm/`, `docs/reports/`, or `supabase/.temp/` files.

**Interfaces:**
- Consumes: successful Task 7 build/browser artifacts and the existing PALIS baseline harness.
- Produces: documented visual evidence that the clerk desktop has two readable actions and the editor is a narrow, right-docked native form; any baseline update corresponds only to this approved UI redesign.

- [ ] **Step 1: Capture the new visual evidence without updating a baseline**

  ```bash
  npm.cmd run verify:baseline
  ```

  Expected: generated comparison shows intended clerk workspace differences; public archive pages remain unchanged unless an amendment-specific directory projection fixture intentionally changed.

- [ ] **Step 2: Inspect the generated desktop/editor screenshots and CSS behavior**

  Verify manually: 60px glyphs, 96px targets, only two clerk actions, no iframe or horizontal outline, right edge docking, one vertical scroll, visible reference cards, and sticky submit controls. Record unexpected public-site changes as failures rather than accepting them.

- [ ] **Step 3: Update the approved baseline only if every diff is intentional**

  ```bash
  npm.cmd run verify:baseline:update
  npm.cmd run verify:baseline
  ```

  Expected: PASS after baseline refresh, with the change limited to the approved workbench UI.

- [ ] **Step 4: Run the final clean verification**

  ```bash
  npm.cmd test
  npm.cmd run build
  npm.cmd run verify:local-admin
  git status --short
  ```

  Expected: all verification commands pass and only intended tracked files are ready to commit.

- [ ] **Step 5: Commit any intentional baseline artifact and hand off**

  ```bash
  git add docs/verification/palis-baseline-manifest.json
  git commit -m "test: update PALIS baseline for native clerk editor"
  ```

  In the handoff, name the migration to apply, state that Supabase enables cross-account review, and state that LOCAL is a single-machine demonstration.
