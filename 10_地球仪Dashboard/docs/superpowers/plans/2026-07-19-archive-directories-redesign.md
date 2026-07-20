# Archive Directories Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved people C, events C, entrances B, and ecology B archive directory experiences without regressing the globe or existing document windows.

**Architecture:** Add a small pure layout module for deterministic network, chronology, topology, and specimen models. Keep rendering in `src/main.js`, use existing archive records and window system, and scope new presentation rules to the four existing archive modes in `src/style.css`.

**Tech Stack:** Vanilla ES modules, HTML, CSS, SVG, Web Animations API, Node test runner, Vite.

---

### Task 1: Pure archive layout models

**Files:**
- Create: `src/archive-layout.js`
- Create: `tests/archive-directories.test.mjs`

- [ ] **Step 1: Write failing tests**

  Test that the people model returns one selected node, no more than twelve visible nodes, stable unique positions, and links whose endpoints are visible. Test event period classification for early, middle, and late records. Test that the entrance model preserves all eighteen entries and connects every node. Test that seven ecology records produce seven distinct specimen readings.

- [ ] **Step 2: Run tests and verify RED**

  Run: `node --test tests/archive-directories.test.mjs`

  Expected: FAIL because `src/archive-layout.js` does not exist.

- [ ] **Step 3: Implement the pure model functions**

  Export `buildPeopleNetworkModel(entries, selectedIndex, limit = 12)`, `classifyEventPeriod(year)`, `buildEntranceTopologyModel(entries)`, and `getEcologySpecimenReading(index)` from `src/archive-layout.js`. All outputs must be deterministic and independent of DOM APIs.

- [ ] **Step 4: Run tests and verify GREEN**

  Run: `node --test tests/archive-directories.test.mjs`

  Expected: all archive directory model tests pass.

### Task 2: Archive data expansion

**Files:**
- Modify: `src/archive-data.js`
- Modify: `tests/archive-directories.test.mjs`

- [ ] **Step 1: Add failing data assertions**

  Import `ARCHIVE_ROOTS` and assert 32 people, 16 events, 18 entrances, and 7 ecology layers. Assert every new event has a year, body, archive code, and status.

- [ ] **Step 2: Run tests and verify RED**

  Run: `node --test tests/archive-directories.test.mjs`

  Expected: FAIL because the current event directory contains ten records.

- [ ] **Step 3: Add six sourced bridge events and ecology specimen metadata**

  Insert V10—V15 into chronological positions in `eventRecords`. Extend ecology records with readings from `getEcologySpecimenReading` at render time rather than duplicating constants in the data file.

- [ ] **Step 4: Run tests and verify GREEN**

  Run: `node --test tests/archive-directories.test.mjs`

  Expected: counts and completeness assertions pass.

### Task 3: Four directory renderers and selection behavior

**Files:**
- Modify: `src/main.js`
- Modify: `tests/archive-directories.test.mjs`

- [ ] **Step 1: Add failing source integration assertions**

  Assert `ARCHIVE_MODES.events` uses `case-chronology`, and that `buildPeopleNetwork`, `buildEventChronology`, `buildEntranceNetwork`, and `buildEcologyStrata` are routed from `buildArchiveOrbit`.

- [ ] **Step 2: Run tests and verify RED**

  Run: `node --test tests/archive-directories.test.mjs`

  Expected: FAIL because the current event mode is `film` and people still use the generic dossier renderer.

- [ ] **Step 3: Implement renderers**

  Build the relationship graph with SVG links, visible-node buttons, a detail sheet, and a 32-person index. Build the three-period case chronology and selected folder preview. Replace entrance class lanes with route topology and a selected-route readout. Replace ecology rows with seven drawer buttons and one specimen tray.

- [ ] **Step 4: Implement shared selection updates**

  Route first-click selection through `updateArchiveSelection`; open the current record on the second click or explicit open button. Cancel obsolete element animations before starting selection animations.

- [ ] **Step 5: Run tests and verify GREEN**

  Run: `node --test tests/archive-directories.test.mjs`

  Expected: renderer routing and mode assertions pass.

### Task 4: Responsive presentation and motion

**Files:**
- Modify: `src/style.css`
- Modify: `tests/ui-density.test.mjs`

- [ ] **Step 1: Add failing CSS assertions**

  Assert the new directory classes exist, dossier motion does not use `steps()`, and the 2K media block increases the four workbench sizes without changing the fixed taskbar contract.

- [ ] **Step 2: Run tests and verify RED**

  Run: `node --test tests/ui-density.test.mjs tests/archive-directories.test.mjs`

  Expected: FAIL because the new workbench selectors do not exist.

- [ ] **Step 3: Implement desktop, 2K, and narrow-screen CSS**

  Add scoped rectangular archive styling, transform/opacity easing, SVG route draw animation, compact 2K scaling, and stacked mobile layouts. Hidden people nodes must use non-animated visibility so they cannot flash during first paint.

- [ ] **Step 4: Run tests and verify GREEN**

  Run: `node --test tests/ui-density.test.mjs tests/archive-directories.test.mjs`

  Expected: all CSS and model assertions pass.

### Task 5: Build and visual verification

**Files:**
- Verify: `src/main.js`
- Verify: `src/style.css`
- Verify: `src/archive-data.js`
- Verify: `src/archive-layout.js`

- [ ] **Step 1: Run the full automated suite**

  Run: `node --test tests/*.test.mjs`

  Expected: all tests pass with no warnings.

- [ ] **Step 2: Build the production bundle**

  Run: `npm run build`

  Expected: Vite exits successfully and writes `dist/`.

- [ ] **Step 3: Verify in the local browser**

  Open the four archive routes at desktop, 2K, and narrow widths. Confirm no initial people-card ghosting, all navigation remains reachable, selected routes draw smoothly, specimen drawers remain readable, and archive windows still open.
