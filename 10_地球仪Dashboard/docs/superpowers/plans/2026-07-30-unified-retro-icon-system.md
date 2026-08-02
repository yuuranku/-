# Unified Retro Icon System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every functional interface icon with one locally bundled Pixelarticons-style SVG system, without altering the site's archive visuals or interactions.

**Architecture:** Keep all existing icon URLs and DOM structure intact. Replace the SVG artwork in `public/assets/icons/` with monochrome, `currentColor`-driven pixel SVGs, then add focused styling so the existing PALIS category colors are inherited rather than baked into assets.

**Tech Stack:** Vite, static SVG assets, vanilla CSS, Node test runner.

## Global Constraints

- Only functional UI icons are replaced; archive document thumbnails, folder/document visuals, flags, seals, mascot, cursor art, photos, maps, ecology diagrams, and animations are unchanged.
- Every replacement is locally bundled; no external icon request is made at runtime.
- Icons use a 24-pixel integer viewBox and `currentColor`; existing blue, red, yellow, green, and gray status colors remain the source of color.
- Existing buttons, keyboard handling, focus states, dimensions, and layout remain unchanged.
- No gradients, glow, round-corner redesign, or new animation is introduced.

---

### Task 1: Lock the functional-icon inventory with a regression test

**Files:**
- Create: `tests/retro-icon-system.test.mjs`
- Read: `index.html:281-296`
- Read: `src/archive-workflow/workspace.js:3309`
- Read: `src/archive-workflow/templates.js:16-80`

**Interfaces:**
- Consumes: `public/assets/icons/<name>.svg` static assets.
- Produces: a test inventory of all functional icon asset paths and their expected Pixelarticons-compatible SVG structure.

- [ ] **Step 1: Write the failing inventory test**

```js
const functionalIcons = [
  'archive-anomaly.svg', 'archive-assistant.svg', 'archive-cabinet.svg',
  'archive-country.svg', 'archive-draft.svg', 'archive-ecology.svg',
  'archive-entrance.svg', 'archive-envelope.svg', 'archive-event.svg',
  'archive-inbox.svg', 'archive-management.svg', 'archive-organization.svg',
  'archive-person.svg', 'archive-review.svg', 'archive-species.svg',
  'archive-station.svg', 'archive-users.svg',
];

for (const file of functionalIcons) {
  const source = readFileSync(resolve(iconDirectory, file), 'utf8');
  assert.match(source, /viewBox=["']0 0 24 24["']/);
  assert.match(source, /currentColor/);
  assert.doesNotMatch(source, /<image\b/i);
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/retro-icon-system.test.mjs`

Expected: FAIL because the present assets have mixed SVG formats and do not all use a 24-pixel `currentColor` format.

- [ ] **Step 3: Add usage assertions**

```js
const html = readFileSync(resolve(projectRoot, 'index.html'), 'utf8');
assert.match(html, /\/assets\/icons\/archive-envelope\.svg/);
assert.match(html, /\/assets\/icons\/archive-country\.svg/);

const workspace = readFileSync(resolve(projectRoot, 'src/archive-workflow/workspace.js'), 'utf8');
assert.match(workspace, /\/assets\/icons\/archive-cabinet\.svg/);
```

- [ ] **Step 4: Commit the test baseline**

```bash
git add tests/retro-icon-system.test.mjs
git commit -m "test: cover retro functional icon inventory"
```

### Task 2: Replace the bundled icon artwork with one pixel-SVG family

**Files:**
- Modify: `public/assets/icons/archive-anomaly.svg`
- Modify: `public/assets/icons/archive-assistant.svg`
- Modify: `public/assets/icons/archive-cabinet.svg`
- Modify: `public/assets/icons/archive-country.svg`
- Modify: `public/assets/icons/archive-draft.svg`
- Modify: `public/assets/icons/archive-ecology.svg`
- Modify: `public/assets/icons/archive-entrance.svg`
- Modify: `public/assets/icons/archive-envelope.svg`
- Modify: `public/assets/icons/archive-event.svg`
- Modify: `public/assets/icons/archive-inbox.svg`
- Modify: `public/assets/icons/archive-management.svg`
- Modify: `public/assets/icons/archive-organization.svg`
- Modify: `public/assets/icons/archive-person.svg`
- Modify: `public/assets/icons/archive-review.svg`
- Modify: `public/assets/icons/archive-species.svg`
- Modify: `public/assets/icons/archive-station.svg`
- Modify: `public/assets/icons/archive-users.svg`
- Test: `tests/retro-icon-system.test.mjs`

**Interfaces:**
- Consumes: current static asset URLs already referenced by HTML and workspace code.
- Produces: 17 visual replacements retaining the same filenames, so no caller needs to change.

- [ ] **Step 1: Select the single-family semantic mapping**

Use this exact mapping from the free Pixelarticons Base SVG set. It identifies the existing function without changing the corresponding label, command, or URL:

```powershell
$iconMap = [ordered]@{
  'archive-anomaly.svg'      = 'warning-diamond.svg'
  'archive-assistant.svg'    = 'avatar-circle.svg'
  'archive-cabinet.svg'      = 'archive.svg'
  'archive-country.svg'      = 'flag.svg'
  'archive-draft.svg'        = 'file.svg'
  'archive-ecology.svg'      = 'leaf.svg'
  'archive-entrance.svg'     = 'door-closed.svg'
  'archive-envelope.svg'     = 'mail.svg'
  'archive-event.svg'        = 'calendar.svg'
  'archive-inbox.svg'        = 'inbox.svg'
  'archive-management.svg'   = 'settings-cog.svg'
  'archive-organization.svg' = 'building-community.svg'
  'archive-person.svg'       = 'user.svg'
  'archive-review.svg'       = 'check.svg'
  'archive-species.svg'      = 'bug.svg'
  'archive-station.svg'      = 'test-tube.svg'
  'archive-users.svg'        = 'users.svg'
}
```

- [ ] **Step 2: Replace each asset with its local 24×24 pixel SVG**

Download the mapped source files from the official package once, copy them into the existing asset paths, and keep the license alongside them:

```powershell
$iconMap.GetEnumerator() | ForEach-Object {
  Invoke-WebRequest -Uri "https://unpkg.com/pixelarticons@latest/svg/$($_.Value)" -OutFile "public/assets/icons/$($_.Key)"
}
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/halfmage/pixelarticons/master/LICENSE' -OutFile 'public/assets/icons/PIXELARTICONS-LICENSE.txt'
```

Each resulting SVG must be the original Pixelarticons 24×24 asset using only `<path>` artwork and `fill="currentColor"`. Do not import web fonts, external SVG URLs, raster image data, JavaScript, animation, or embedded style tags.

- [ ] **Step 3: Run the inventory test to verify all assets pass**

Run: `node --test tests/retro-icon-system.test.mjs`

Expected: PASS with all 17 assets detected and every asset using `viewBox="0 0 24 24"` plus `currentColor`.

- [ ] **Step 4: Commit the icon artwork**

```bash
git add public/assets/icons tests/retro-icon-system.test.mjs
git commit -m "feat: unify functional icons with pixel svg assets"
```

### Task 3: Make existing PALIS icon containers color the replacements correctly

**Files:**
- Modify: `index.html:281-296`
- Modify: `src/style.css:9253-9461`
- Modify: `src/archive-workflow/archive-cabinet.js:42`
- Modify: `src/archive-workflow/workspace.js:781-800`
- Modify: `src/archive-workflow/workspace.css:16,86`
- Test: `tests/clerk-workspace.test.mjs`
- Test: `tests/retro-icon-system.test.mjs`

**Interfaces:**
- Consumes: 24×24 `currentColor` SVG assets from Task 2.
- Produces: local SVG files are used as CSS masks, so category accents remain controlled by the existing PALIS CSS variables in desktop, mobile, archive-cabinet, taskbar, and titlebar contexts.

- [ ] **Step 1: Write failing color and sizing assertions**

```js
assert.match(html, /clerk-desktop__icon-glyph/);
assert.match(styles, /\.clerk-desktop__icon-glyph\s*\{[^}]*mask:\s*var\(--pixel-icon\)/s);
assert.match(styles, /\.clerk-desktop__icon-glyph\s*\{[^}]*background:\s*var\(--category-accent/s);
assert.match(workspaceStyles, /\.archive-workflow-pixel-icon\s*\{[^}]*mask:\s*var\(--pixel-icon\)/s);
```

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `node --test tests/clerk-workspace.test.mjs tests/retro-icon-system.test.mjs`

Expected: FAIL because the current desktop rail still renders its local SVGs as external image documents, which cannot inherit the parent category color.

- [ ] **Step 3: Add the minimal CSS compatibility rule**

```css
.clerk-desktop__icon-glyph {
  background: var(--category-accent, var(--clerk-cyan));
  -webkit-mask: var(--pixel-icon) center / contain no-repeat;
  mask: var(--pixel-icon) center / contain no-repeat;
}
```

Use the same mask pattern in the archive cabinet and generated workflow title/task icons. Preserve existing responsive dimensions and do not remove focus, selection, active-state, or category color declarations.

- [ ] **Step 4: Run targeted tests to verify they pass**

Run: `node --test tests/clerk-workspace.test.mjs tests/retro-icon-system.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the presentation rules**

```bash
git add src/style.css tests/clerk-workspace.test.mjs tests/retro-icon-system.test.mjs
git commit -m "style: preserve PALIS colors for pixel icons"
```

### Task 4: Verify the live UI boundaries and production build

**Files:**
- Read: `tests/local-admin-runtime-browser.test.mjs:71-96`
- Read: `tests/workspace-ux-regression.test.mjs:52-75`

**Interfaces:**
- Consumes: completed static assets and CSS from Tasks 2–3.
- Produces: build and visual-regression evidence that functional icons changed while protected visuals did not.

- [ ] **Step 1: Run focused automated checks**

Run: `node --test tests/retro-icon-system.test.mjs tests/clerk-workspace.test.mjs tests/workspace-ux-regression.test.mjs`

Expected: PASS.

- [ ] **Step 2: Build the production bundle**

Run: `npm.cmd run build`

Expected: exit code 0 and a generated `dist/` directory.

- [ ] **Step 3: Inspect the desktop at 1280×800 and 760×800**

Run: `node --test tests/local-admin-runtime-browser.test.mjs`

Expected: PASS; visible functional icons fit their existing 60px/compact containers, no text is obscured, and existing desktop mechanics remain intact.

- [ ] **Step 4: Manually check protected assets**

Open the ecology page and a formal archive record. Confirm the ecology animated panel, archive photos, seal, mascot, cursor artwork, and document/folder thumbnails are visually unchanged.

- [ ] **Step 5: Commit final verification-only adjustments if any are required**

```bash
git add src/style.css tests public/assets/icons
git commit -m "fix: keep pixel icons within PALIS desktop layout"
```
