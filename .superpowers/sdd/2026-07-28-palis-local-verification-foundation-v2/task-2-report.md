# Task 2 / C01 — archive repository contract

## Scope completed

- Added `src/archive-workflow/repository-contract.js` with a frozen, 25-method repository surface, repository assertion, and UI-facing result-shape assertion.
- Added focused repository contract and result-shape tests, including real Supabase join/RPC fixtures.
- Added `defineArchiveWorkflowRepositoryConformance()` and proved it against a compliant in-memory repository. Its review queue test rejects a deliberately owner-less response.
- Wired `createArchiveWorkflowClient()` through the repository assertion at its construction boundary.
- Preserved `schemaVersion: 2` fixtures, existing snake_case client results, the current CAS conflict shape (`{ status: 'conflict', conflict: true, cloud }`), and existing validation error codes.

## Compatibility decisions

- Relation fields returned by Supabase are validated at their actual selected shapes: review owners (`id,email,display_name`), public contribution people (`id,display_name`), public contribution/version RPC records, and reference source archives (`id,code,title,visibility`).
- Existing history remains readable: nullable relation objects, nullable archive sequence/abbreviation values, nullable version modifier/reviewer, and empty version arrays remain valid where the client/UI permits them.
- The generic read-result validator does not reject legacy document payloads solely for an older schema version. C01 fixtures and all new conformance saves use `schemaVersion: 2`; changing legacy-document migration behavior is intentionally deferred.

## TDD evidence

1. RED: `node --test tests/archive-workflow-repository-contract.test.mjs` failed with `ERR_MODULE_NOT_FOUND` for `repository-contract.js`.
2. GREEN: the same command passed after the minimal frozen method contract was added (2 passing tests at that point).
3. RED: `node --test tests/archive-workflow-repository-shapes.test.mjs` failed because `assertArchiveWorkflowResult` was not exported.
4. GREEN: repository contract and shape suites passed after the minimal result validator was added.
5. RED: contract suite failed with `ERR_MODULE_NOT_FOUND` for `tests/helpers/archive-workflow-repository-conformance.mjs`.
6. GREEN: the reusable helper passed all three groups against the compliant in-memory repository and rejected the intentionally owner-less review queue.
7. RED: `node --test tests/archive-workflow-client.test.mjs` failed because the client did not import/call the repository assertion.
8. GREEN: client construction now returns `assertArchiveWorkflowRepository({...})`.

## Final verification

- `node --test tests/archive-workflow-repository-contract.test.mjs tests/archive-workflow-repository-shapes.test.mjs tests/archive-workflow-client.test.mjs` — 21 passing, 0 failing.
- `npm test` was blocked before execution by the local PowerShell execution policy for `npm.ps1`; `npm.cmd test` ran the intended suite — 138 passing, 0 failing.
- `npm.cmd run build` — exited 0. Vite reported only its pre-existing large-chunk advisory.
- `git diff --check` — exited 0.

## Files staged for this task

- `src/archive-workflow/client.js`
- `src/archive-workflow/repository-contract.js`
- `tests/archive-workflow-client.test.mjs`
- `tests/archive-workflow-repository-contract.test.mjs`
- `tests/archive-workflow-repository-shapes.test.mjs`
- `tests/helpers/archive-workflow-repository-conformance.mjs`
- `.superpowers/sdd/2026-07-28-palis-local-verification-foundation-v2/task-2-report.md`

## Reviewer fix round

- Added `invalid_document` for new and updated `saveDraft` inputs whose `content`/`draft_content` is absent or whose `schemaVersion` is not `2`.
- Existing-draft revision validation intentionally precedes document validation, so an existing draft with revision `0` still returns `invalid_revision`.
- Kept legacy document tolerance limited to read-result validation; old persisted values remain readable and are not rejected by the generic result validator.
- Tightened `listReviewQueue`: `owner` is now required and non-null, and its selected `display_name` remains required. `archive` remains nullable.

### Fix TDD and verification

1. RED: `node --test tests/archive-workflow-client.test.mjs tests/archive-workflow-repository-shapes.test.mjs` failed because legacy/missing write documents were accepted and `owner: null` was accepted.
2. GREEN: `node --test tests/archive-workflow-repository-contract.test.mjs tests/archive-workflow-repository-shapes.test.mjs tests/archive-workflow-client.test.mjs` — 23 passing, 0 failing.
3. `npm.cmd test` — 140 passing, 0 failing.
4. `npm.cmd run build` — exited 0; only Vite's existing large-chunk advisory was reported.
