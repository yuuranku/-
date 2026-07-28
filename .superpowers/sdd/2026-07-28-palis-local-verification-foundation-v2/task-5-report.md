# Task 5 / C03b — IndexedDB repository and local snapshots

## Scope completed

- Added a browser-native IndexedDB state store with exactly one `state` object store and the fixed `current` key.
- Kept each `transactState` call inside exactly one `readwrite` transaction. The reducer runs synchronously from `get("current").onsuccess`, its result is written before the transaction completes, and reducer failures explicitly abort.
- Isolated all public reads and command results with structured deep copies.
- Closed cached connections on `versionchange`; a blocked reset now rejects with `code: "reset_blocked"` in less than two seconds instead of hanging.
- Composed the C03a local workflow engine without changing it. Missing databases use the supplied seed inside the first command transaction, so initialization does not add a second write or create a cross-page lost-update window.
- Added `resetLocalDatabase`, `exportLocalSnapshot`, and `importLocalSnapshot` while preserving all 25 C01 repository methods.
- Fixed the local database identity to `palis-local-verification-v1`.
- Added schema-version-1 snapshots with a canonical-payload SHA-256 checksum and a full ISO-8601 export timestamp.
- Serialized `Blob` and `File` values as `{name,type,size,sha256,base64}` and verified the inner digest and exact byte count before reconstructing binary values.
- Validated snapshot schema, database identity, timestamp, checksum, state-store shape, counter shape, and attachment integrity before opening the single import write transaction. Invalid imports leave the current database unchanged.
- Verified that passwords supplied to account creation and password reset commands never appear in exported JSON.
- Added an isolated HTML fixture that imports only its own local repository modules. It does not load `main.js` or `auth.js`.
- Added a self-starting Vite test server that reserves distinct OS-assigned loopback ports and closes its listener, connections, watcher, pages, and browser on teardown.
- Restricted browser-test requests to the current loopback origin plus `data:` and `blob:` URLs; external and other-loopback requests are blocked.
- Began on commit `036b758`; after the approved C03a contract fixes landed, final verification ran against `57d69c9`.

## TDD evidence

1. RED: the first isolated fixture run failed in 1.53 seconds with `Failed to fetch dynamically imported module .../local-indexeddb-repository.js`.
2. GREEN: the minimal repository export made the fixture smoke test pass 1/1.
3. RED: importing the missing `indexeddb-state-store.js` failed both browser tests.
4. GREEN: the single-store transaction adapter passed persistence, copy isolation, rollback, and write-count checks 2/2.
5. RED: removing lifecycle handling made the upgrade request report `upgradeBlocked: true`, and the blocked reset exceeded the 1.9-second test deadline.
6. GREEN: `versionchange` close and explicit `reset_blocked` rejection passed 3/3.
7. RED: repository browser tests failed because `resetLocalDatabase` and the C01 methods did not exist.
8. GREEN: the composed C03a repository persisted across pages and concurrent publication produced `EV27` and `EV28`; the focused suite passed 5/5.
9. RED: snapshot tests failed because `exportLocalSnapshot` did not exist.
10. GREEN: codec, export, import, attachment restoration, password exclusion, and invalid-import atomicity passed 7/7.
11. RED: the random-port test exposed that Vite normalizes `port: 0` to fixed port 5173.
12. GREEN: reserving an OS-assigned loopback port made two simultaneous servers use distinct non-default ports and close cleanly.
13. RED: removing the thenable guard changed an async reducer failure to `must return nextState`; the regression test required the explicit `must be synchronous` contract.
14. GREEN: the restored guard aborts the third write transaction and preserves the `current` state.
15. RED: a bare year (`"2026"`) was incorrectly accepted as the snapshot export timestamp.
16. GREEN: full ISO date-time validation rejects it before any write.
17. GREEN: the shared C01 conformance helper passed all three groups through the real browser IndexedDB repository.

## Mutation checks

1. Removing automatic `versionchange` close made the lifecycle test fail because the version-2 open was blocked.
2. Removing the synchronous-reducer guard made the focused reducer test fail on the wrong error contract.
3. Restoring Vite's fixed `port: 0` behavior made the random-port test fail on port 5173.
4. Permitting `Date.parse` alone made the invalid-snapshot test accept a bare-year timestamp.

## Final verification

- `node --test tests/local-indexeddb-browser.test.mjs` — 11 passing, 0 failing or cancelled; 13.20 seconds.
- `npm.cmd test` — 194 passing, 0 failing or cancelled; 54.24 seconds.
- Both commands exited normally after browser and server teardown.
- No deployment was performed.
- No production client, `main.js`, authentication, UI, package, migration, report, old-plan, temporary, or Supabase temp file was changed.

## Task files

- `src/archive-workflow/local/indexeddb-state-store.js`
- `src/archive-workflow/local/local-snapshot-codec.js`
- `src/archive-workflow/repositories/local-indexeddb-repository.js`
- `tests/fixtures/indexeddb-harness.html`
- `tests/helpers/palis-test-server.mjs`
- `tests/local-indexeddb-browser.test.mjs`
- `.superpowers/sdd/2026-07-28-palis-local-verification-foundation-v2/task-5-report.md`
