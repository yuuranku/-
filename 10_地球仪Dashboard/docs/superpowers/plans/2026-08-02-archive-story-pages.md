# Archive Story Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add simple per-archive public story pages to all nine archive categories, editable by their authors and visible from the archive window's View menu.

**Architecture:** A small pure helper module owns labels, permissions, validation, and menu/editor markup. Existing workflow repositories expose CRUD methods backed by one Supabase table or the local verification state. `main.js` only resolves the current archive, opens the story editor, and refreshes the View menu.

**Tech Stack:** Vite, vanilla JavaScript, Node test runner, Supabase/PostgreSQL RLS, existing PALIS Win95 CSS.

---

### Task 1: Story-page domain behavior

**Files:**
- Create: `src/archive-workflow/story-pages.js`
- Test: `tests/archive-story-pages.test.mjs`

- [ ] Write failing tests for numbered default titles, editable custom titles, body validation, author/admin edit permissions, and escaped menu/editor markup.
- [ ] Run `node --test tests/archive-story-pages.test.mjs` and confirm failure because the module is missing.
- [ ] Implement the pure helpers with a 4000-character limit and no rich text.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Repository support and local verification

**Files:**
- Modify: `src/archive-workflow/repository-contract.js`
- Modify: `src/archive-workflow/repositories/supabase-repository.js`
- Modify: `src/archive-workflow/local/local-state.js`
- Modify: `src/archive-workflow/local/local-snapshot-codec.js`
- Modify: `src/archive-workflow/local/local-workflow-engine.js`
- Test: `tests/archive-story-repository.test.mjs`

- [ ] Write failing repository tests for list, create, update-own, delete-own, admin override, and admin notification creation.
- [ ] Run the focused test and verify permission and missing-method failures.
- [ ] Add `listArchiveStoryPages`, `createArchiveStoryPage`, `updateArchiveStoryPage`, and `deleteArchiveStoryPage` to both repositories and their result contracts.
- [ ] Re-run the focused test and confirm it passes.

### Task 3: Supabase schema and policies

**Files:**
- Create: `supabase/migrations/202608020001_archive_story_pages.sql`
- Test: `tests/archive-story-migration.test.mjs`

- [ ] Write a failing migration text test that requires one shared table, public read, authenticated observer/clerk/admin insert, owner/admin update-delete, 4000-character validation, and administrator mailbox notifications.
- [ ] Run the focused test and confirm failure because the migration is absent.
- [ ] Create the table, RLS policies, indexes, and insert trigger. The trigger inserts `announcement` notifications for enabled administrators after a new story page is saved.
- [ ] Re-run the migration test and confirm it passes.

### Task 4: View menu and lined-paper editor

**Files:**
- Modify: `index.html`
- Modify: `src/main.js`
- Modify: `src/style.css`
- Test: `tests/archive-story-ui.test.mjs`

- [ ] Write failing markup tests requiring a real `查看(V)` menu, custom title entries, `添加留言`, a plain textarea, save/delete controls, and no preview text in the menu.
- [ ] Run the focused test and confirm failure against the current static View label.
- [ ] Convert View into the same accessible menu pattern as File/Edit, load pages on open, and open a draggable Win95 window containing an editable title and lined paper textarea.
- [ ] Allow public reads; only signed-in observer/clerk/admin users can add; only author/admin can edit or delete.
- [ ] Refresh the menu after saves/deletes and show compact offline/error states.
- [ ] Re-run the focused UI test and confirm it passes.

### Task 5: Regression and visual verification

**Files:**
- Modify only if verification reveals a defect in the files above.

- [ ] Run `npm test` and resolve any regression.
- [ ] Run `npm run build` and confirm a successful production build.
- [ ] Start local-admin mode and open representative archives from multiple categories.
- [ ] Verify View-menu keyboard behavior, add/edit/delete, menu numbering, author permissions, and the lined-paper window at desktop and mobile widths.
- [ ] Inspect the final diff to ensure no archive form, publication, or review behavior changed.
