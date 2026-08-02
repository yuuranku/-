# Event Archive Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure newly published event archives receive the correct next identifier, show their correct cover metadata, and remain vertically scrollable within the archive window.

**Architecture:** The native event editor will project its fixed mission date and area into the archive index, while the index projector retains a safe fallback for older records. The formal renderer will avoid repeating a date already embedded in a legacy event title, and CSS will constrain the existing formal document to the archive window. A Supabase migration will repair the current EV33 record, synchronize future event index metadata, reset the event counter from the actual highest identifier, and remove the ambiguous contribution query.

**Tech Stack:** Vite, vanilla JavaScript, CSS, Node test runner, Supabase PostgreSQL migrations.

## Global Constraints

- Preserve the existing White Abyss archive UI and document templates; do not replace them with a new layout.
- Do not publish directly to Cloudflare; production release remains GitHub `main` to Cloudflare.
- Do not apply the Supabase migration to production without separate user approval.
- Use test-first changes and preserve unrelated uncommitted user work.

---

### Task 1: Project fixed event metadata into the index

**Files:**
- Modify: `src/archive-workflow/native-form-profiles.js`
- Modify: `src/archive-workflow/index-projector.js`
- Create: `tests/event-archive-reliability.test.mjs`

**Interfaces:**
- Consumes: `writeNativeFormDocument(template, state, existingDocument)` and `projectPublishedArchive(archive)`.
- Produces: event `indexData.startDate`, `indexData.location`, `indexData.reviewStatus`, and a legacy cover-date fallback.

- [ ] **Step 1: Write the failing test**

```js
test('event document projects mission date and area into the archive index', () => {
  const document = writeNativeFormDocument(eventTemplate, {
    title: '1964.12.10/ AU-W1 样本采集任务',
    indexData: { title: '1964.12.10/ AU-W1 样本采集任务' },
    body: { missionDate: '1964年12月10日', missionArea: '威尔克斯湿门（AU-W1）' },
  });

  assert.equal(document.indexData.startDate, '1964-12-10');
  assert.equal(document.indexData.location, '威尔克斯湿门（AU-W1）');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/event-archive-reliability.test.mjs`

Expected: FAIL because `startDate` and `location` are absent from the generated event index.

- [ ] **Step 3: Write minimal implementation**

```js
if (template.category === 'event') {
  const missionDate = valueOf(state.body?.missionDate).trim();
  const missionArea = valueOf(state.body?.missionArea).trim();
  indexData.startDate = normalizeEventStartDate(missionDate) || indexData.startDate;
  indexData.location = missionArea || indexData.location;
  indexData.reviewStatus = indexData.reviewStatus || '待审核';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/event-archive-reliability.test.mjs`

Expected: PASS.

- [ ] **Step 5: Add the legacy fallback test and implementation**

```js
assert.equal(projectPublishedArchive({
  category: 'event',
  title: '1964.12.10/ AU-W1 样本采集任务',
  index_payload: { title: '1964.12.10/ AU-W1 样本采集任务' },
}).year, '1964.12.10');
```

Implement the fallback only when the event index date is absent, by extracting a leading `YYYY.MM.DD`, `YYYY-MM-DD`, or `YYYY年M月D日` value from the title.

### Task 2: Keep formal event documents inside their window

**Files:**
- Modify: `src/archive-workflow/public-renderer.js`
- Modify: `src/style.css`
- Modify: `tests/event-archive-reliability.test.mjs`
- Modify: `tests/clerk-native-editor-browser.test.mjs`

**Interfaces:**
- Consumes: formal event document rendering and `document-sheet` archive-window styles.
- Produces: a non-duplicated event heading and a vertically scrollable document sheet whose layout does not overflow horizontally.

- [ ] **Step 1: Write the failing tests**

```js
assert.doesNotMatch(renderedHtml, /1964\.12\.10\s*\/\s*1964\.12\.10/);
assert.ok(metrics.scrollWidth <= metrics.clientWidth + 1);
assert.ok(metrics.scrollTopAfterWheel > metrics.scrollTopBeforeWheel);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/event-archive-reliability.test.mjs tests/clerk-native-editor-browser.test.mjs`

Expected: the renderer repeats a date already present in the title, and the narrow event window can overflow horizontally.

- [ ] **Step 3: Write minimal implementation**

```css
.document-sheet { overflow-x: hidden; }
.archive-formal-document--event .reel-mast > * { min-width: 0; }
.archive-formal-document--event .reel-mast h2 { overflow-wrap: anywhere; }
```

Strip a matching leading rendered date plus separator from a formal event title before composing the mast heading. Keep the existing stamp, typography, table, and paragraph layout unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/event-archive-reliability.test.mjs tests/clerk-native-editor-browser.test.mjs`

Expected: PASS.

### Task 3: Repair the database workflow for this event and future event uploads

**Files:**
- Create: `supabase/migrations/202607300011_event_archive_reliability.sql`
- Modify: `tests/local-workflow-engine.test.mjs`

**Interfaces:**
- Consumes: `archives`, `archive_number_counters`, `archive_versions`, and `publish_archive_contribution`.
- Produces: EV02 for the repaired current community record, an event counter based on actual records, synchronized event index fields, and a non-ambiguous contribution publication query.

- [ ] **Step 1: Write the failing local allocation test**

```js
assert.equal(nextEvent.code, 'EV02');
assert.equal(nextEvent.sequenceNumber, 2);
```

Seed an official EV01 and a stale event counter value of 32, then create the first community event.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/local-workflow-engine.test.mjs`

Expected: FAIL because the stale counter produces EV33.

- [ ] **Step 3: Write migration and minimal local parity repair**

```sql
update public.archives
set sequence_number = 2, code = 'EV02'
where category = 'event'
  and origin = 'community'
  and sequence_number = 33
  and code = 'EV33'
  and not exists (
    select 1 from public.archives occupied
    where occupied.category = 'event'
      and occupied.sequence_number between 2 and 32
  );
```

The migration must then set the event counter to the actual maximum event sequence, backfill event `startDate` and `location` from the latest version’s native values, create an `archive_versions` trigger to keep those index values synchronized, and redefine `publish_archive_contribution` with qualified `archive_references.target_archive_id` references.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/local-workflow-engine.test.mjs`

Expected: PASS.

- [ ] **Step 5: Verify the integrated change**

Run: `npm test && npm run build`

Expected: all tests and the production build pass.

### Task 4: Visual verification and controlled release handoff

**Files:**
- Verify: `src/style.css`, `src/archive-workflow/public-renderer.js`, `src/main.js`

- [ ] **Step 1: Open a narrow event archive window**

Verify the stamp remains fully inside the window, the title wraps rather than widening the document, and the mouse wheel scrolls the document vertically.

- [ ] **Step 2: Verify cover metadata**

Verify the card receives the event year from the fixed mission date and that the heading displays its date only once.

- [ ] **Step 3: Request production database approval**

Do not apply `202607300011_event_archive_reliability.sql` until the user explicitly authorizes the production Supabase migration. After approval, apply the migration, verify the EV33 repair, and then release source changes through GitHub `main` for Cloudflare synchronization.
