# Task 4 / C03a — transactional local archive workflow engine

## Scope completed

- Added an actually empty local state factory with all 13 named stores. The 12 collection stores are empty arrays or objects as appropriate, and `idempotencyResults` is an empty key-addressable object.
- Added the complete 25-method C01 repository surface without changing the Supabase repository or production client.
- Kept every read on one `readState()` snapshot and every write in exactly one synchronous `transactState(reducer)` call. Reducers clone the incoming state and all public results are isolated deep copies.
- Resolve the principal at command time. Administrators own drafts they create even when an input attempts to spoof another owner; clerks cannot impersonate owners or perform review, publication, account-administration, or new station/entrance actions.
- Enforced schema version `2`, optimistic draft revisions, same-contribution resubmission after a change request, and the exact submission audit snapshot (`0.1` / `白幕初垂`).
- Implemented review replies, owner notifications, account management, archive queries, immutable public version projections, references, guarded deletion, and 1-byte through 5MB `File`/`Blob` attachments.
- Password inputs are only length-validated. Plaintext values are not copied into state, audit details, list/export results, or command results.
- Added single-reducer publication with the fixed nine-category prefixes `N/O/ST/EN/E/P/EV/A/S` and abbreviations `REG/CHN/LOG/CRD/ECO/PER/RLL/TRC/SPC`.
- Publication assigns `EV27` from an event counter of 26 while retaining `sequence_number: 27`, `abbreviation: RLL`, and the independent business code. Amendments preserve existing `code`, `sequence_number`, `abbreviation`, and business-code identity.
- Publication idempotency is checked by object key before counter allocation. Equal retries reuse the stored result without duplicating counters, versions, indexes, audits, or notifications; reuse with a different payload returns `idempotency_conflict`.
- The `version`, `projection`, `archive`, `index`, `audit`, and `notification` failpoints all abort before the store commits, leaving state and commit count unchanged.
- The C01 `events` fixture is normalized to singular `event` only inside the test harness; formal local records use singular category values.

## TDD evidence

1. RED: `node --test tests/local-workflow-engine.test.mjs` failed with `ERR_MODULE_NOT_FOUND` for `local-state.js`.
2. GREEN: empty state and principal-aware draft creation passed (3 tests).
3. RED: read/submit tests failed because `getProfile` and `submitDraft` did not exist.
4. GREEN: reads, schema validation, CAS, deep copies, and submission snapshots passed (6 tests).
5. RED: permission/account/review/notification/attachment tests failed on the missing methods, and the clerk station test caught the initially missing category policy.
6. GREEN: the non-publication command set passed (14 tests). A separate RED confirmed `idempotencyResults: []` was wrong before it was changed to `{}`.
7. RED: archive read-model and deletion tests failed because their methods did not exist.
8. GREEN: filtered directories, public version projections, reference relations, and guarded deletion passed (18 tests).
9. RED: six publication groups failed because `publishContribution` did not exist.
10. GREEN: publication initially reached 23/24; the remaining test exposed a retry fingerprint that changed after `archive_id` was committed. Basing the fingerprint only on the command fixed the defect, producing 24/24.
11. RED: the three C01 conformance groups failed because the harness had not yet converted the shared fixture to local state.
12. GREEN: the focused suite, including all C01 conformance groups, passed 27/27.

## Mutation checks

1. Temporarily allowing a clerk to create a new station made the focused permission test fail with `Missing expected rejection`.
2. Temporarily removing the counter increment made the event publication test fail with `EV26 !== EV27`.
3. After restoring both mutations, `node --test tests/local-workflow-engine.test.mjs` passed 27/27.

## Final verification

- `node --test tests/local-workflow-engine.test.mjs` — 27 passing, 0 failing.
- `npm.cmd test` — 172 passing, 0 failing.
- No deployment was performed.

## Task files

- `src/archive-workflow/local/local-state.js`
- `src/archive-workflow/local/local-workflow-engine.js`
- `tests/helpers/local-workflow-harness.mjs`
- `tests/local-workflow-engine.test.mjs`
- `.superpowers/sdd/2026-07-28-palis-local-verification-foundation-v2/task-4-report.md`
