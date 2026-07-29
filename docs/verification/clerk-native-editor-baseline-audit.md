# Clerk Native Editor baseline audit — 2026-07-30

Status: **pending visual evidence; no baseline was created or updated.**

This integration pass verified the native-editor and Sticky Notes behavior with the local browser runtime, but it cannot complete a pixel-baseline acceptance yet:

- `tmp/verification/baseline/` is absent in this worktree.
- The current production build's `dist/index.html` SHA-256 is `bc1e624d01c3b2a38db3ca8f634f74fb765a78d9f2560025649730770cc35e6e`.
- `docs/verification/palis-baseline-manifest.json` records `distEntrySha256` as `1e2b13c01ffe8924b51936b2278b3ffa5daee89664a01d6724813297872ee045`.

Those facts make a visual difference result ambiguous: there is no committed baseline image set to compare, and the recorded manifest belongs to a different build entry. This task intentionally did **not** run a baseline-update command, modify the manifest, or accept new screenshot hashes.

The non-mutating `npm.cmd run verify:baseline` command was also attempted. Its build completed, but capture stopped before comparison with a timeout waiting for `#access-login:not([hidden])` in `capture-palis-baseline.mjs` / `waitForPalisScene`. It produced no capture files and did not reach the baseline comparison or update path. That harness failure is recorded as a verification-environment issue, not accepted as visual evidence.

The live browser coverage added in this pass confirms the functional native surface: 03 and 04 open as native right-docked forms, a returned amendment is resubmitted, approved, formally accessioned, and rendered with its formal number, version, and attribution. Existing Sticky Notes browser coverage separately exercises wide/narrow layouts, reduced motion, admin editing, clerk read-only close/reopen, drag bounds, and profile-scoped layouts. That behavioral evidence is not a substitute for visual approval.

Before visual acceptance, restore or explicitly authorize a new baseline artifact set, then inspect the generated wide and narrow captures for the native right dock, large desktop targets, archive ledger, and workspace notes (including reduced motion) before updating the manifest.
