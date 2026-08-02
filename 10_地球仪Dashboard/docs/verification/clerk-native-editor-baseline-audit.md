# Clerk Native Editor baseline audit - 2026-07-30

Status: **current capture is healthy; the reviewed baseline was explicitly
accepted on 2026-07-30.**

The normal verifier now has a self-contained canonical bundle at
`docs/verification/palis-baseline/`: 39 PNG artifacts plus `manifest.json`.
The bundle validates its hashes and dimensions, and its manifest is identical
to `docs/verification/palis-baseline-manifest.json`. Normal comparison reads
that bundle; only `verify:baseline:update` can replace it after visual review.

The former access-gate timeout was a production startup defect. The emitted
lazy archive-client chunk statically imported the production entry, while the
entry awaited that client, forming an async module cycle before authentication
could register its controls. The Vite configuration now isolates the shared
archive-workflow modules in their own chunk. The client remains lazy (so local
administrator mode does not request cloud authentication), but no longer
imports the entry through the generated bundle graph.

The browser harness waits directly for the visible login control and enabled
Preview button, then clicks that button; it has no synthetic boot click. It
preflights `dist/index.html`. Browser-preview tests build a unique temporary
production fixture, so ordinary `npm test` neither reads nor writes ignored
workspace `dist/`. The visual fixture also moves Puppeteer's residual pointer
to the inert viewport corner and waits two frames before capture, eliminating
an accidental folder hover state.

Verification on this branch:

- `node --test tests/palis-baseline-harness.test.mjs`: passed, 15/15. This
  includes the built-preview readiness check, the isolated fixture contract,
  hover clearing, and a real 13-scene capture.
- `node --test tests/local-admin-runtime-browser.test.mjs`: passed, 2/2,
  including its no-cloud-authentication assertion.
- `node --test tests/clerk-native-editor-browser.test.mjs`: passed, 3/3. The
  returned-amendment path now checks that the formally published record renders
  the unique revised body text as well as its version and attribution.
- Before acceptance, build and all 39 current captures completed with clean
  manifest validation (`diagnostics`, fatal requests, and unknown external
  requests were empty). The 11 reviewed differences above the 0.5% threshold
  were:
  - Win95 clerk-workspace redesign: 94.823%, 94.740%, 90.934%, 90.616%,
    88.853%, and 88.586% across its desktop/narrow/wide clerk and admin scenes.
  - Expanded event-plane layout and changed event subtitle: 0.596% at
    1440x900, 0.598% at 390x844, and 1.315% at 844x390.
  - Narrow entrance directory layout: 0.673% at 390x844.
  - Expanded species helix/composite layout: 2.299% at 390x844.

The reviewed differences are existing product changes after baseline commit
`e90de1b`, not capture timing: two independent 844x390 runs had identical
scene state and proof summaries; 11 of 13 PNG hashes were exact matches, and
the two raw raster differences were only 0.0167% and 0.0164% before
pixelmatch's antialias filtering. The current production entry SHA-256 is
`5d025250d2bd8eb8d40b3947358a3104740add7758378960a5d23f1ce6611af1`.
The accepted manifest now records that same entry hash and all 39 reviewed
screenshots; a fresh `npm.cmd run verify:baseline` passed afterward. Generated
current/diff evidence remains under untracked `tmp/verification/`.
