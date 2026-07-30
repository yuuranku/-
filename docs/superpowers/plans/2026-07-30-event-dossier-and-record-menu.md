# Event Dossier and Record Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give events the same clerk-editable fixed fields and repeatable sections as organizations, while restoring the archive reading layout and moving record navigation into the window menus.

**Architecture:** Native form profiles persist event fixed fields in the version document. The formal renderer maps those fields into the event dossier table and keeps organization structure fields in their original compact table treatment. Published record tabs remain in the DOM for panel selection but are exposed through the File menu; edit actions move to Edit. Archive metadata is rendered as a footer after document content.

**Tech Stack:** Vite, vanilla JavaScript, HTML templates, CSS, Node test runner.

## Global Constraints

- Do not alter a clerk-authored document when re-opening it for amendment.
- Fixed dossier fields are optional; custom title/content entries remain repeatable.
- Preserve existing archive-panel selection and media loading behavior.
- Do not commit or publish the shared dirty worktree.

---

### Task 1: Event native dossier data

**Files:**
- Modify: `src/archive-workflow/native-form-profiles.js`
- Modify: `src/archive-workflow/official-archive-source.js`
- Test: `tests/native-form-profiles.test.mjs`

- [ ] Write a failing test for six optional event fields and rehydration of saved values/custom entries.
- [ ] Add `missionNumber`, `missionDate`, `missionArea`, `teamStatus`, `missionContent`, and `archiveStatus` to the event native profile.
- [ ] Map legacy static event facts and report blocks into those fixed values and repeatable entries.
- [ ] Run the native-form and archive-source tests.

### Task 2: Formal dossier layout

**Files:**
- Modify: `src/archive-workflow/public-renderer.js`
- Modify: `src/style.css`
- Test: `tests/archive-public-renderer.test.mjs`

- [ ] Write failing renderer tests for horizontal organization structure fields, event dossier fields, and metadata after content.
- [ ] Render organization structure fields as a compact source-chain table instead of a generic chapter card.
- [ ] Render event fixed values as the incident dossier table; render custom entries as report sections.
- [ ] Move formal archive metadata to a footer after all document content and evidence.
- [ ] Run formal-renderer tests.

### Task 3: Record navigation menus

**Files:**
- Modify: `index.html`
- Modify: `src/archive-workflow/publication.js`
- Modify: `src/main.js`
- Modify: `src/style.css`
- Test: `tests/archive-publication.test.mjs`

- [ ] Write failing tests requiring record choices in File and edit actions in Edit.
- [ ] Remove the visible multi-source mast and tab strip from published document markup.
- [ ] Populate the File menu from its hidden record selectors and route selection through the existing panel/media logic.
- [ ] Move amendment, export, print, and close into the Edit menu without changing their actions.
- [ ] Run archive-publication tests and build the site.
