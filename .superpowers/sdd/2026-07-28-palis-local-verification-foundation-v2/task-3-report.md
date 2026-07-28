# Task 3 / C02 — Supabase archive repository isolation

## Scope completed

- Moved `ArchiveWorkflowError`, Supabase helpers, and all 25 archive-workflow methods into `src/archive-workflow/repositories/supabase-repository.js`.
- Exported `createSupabaseArchiveWorkflowRepository(supabase)` and returned the repository through `assertArchiveWorkflowRepository`.
- Reduced `src/archive-workflow/client.js` to a compatibility re-export. `createArchiveWorkflowClient` is the same function identity as the new repository factory, and `ArchiveWorkflowError` remains available from the old module.
- Added a stateful Supabase mock harness that runs all three C01 repository conformance groups: draft/CAS/deep-copy, review relations and decisions, and published archive read models with public contribution versions.
- Updated the client API test to iterate `ARCHIVE_WORKFLOW_METHODS` directly and moved source-level implementation checks to the repository module.
- Updated the archive-admin static checks to read the repository source. This is necessary because the compatibility client no longer owns the `admin-manage-user` and review-validation implementation.

## TDD evidence

1. RED: `node --test tests/supabase-archive-workflow-repository.test.mjs` failed with `ERR_MODULE_NOT_FOUND` for `supabase-repository.js`.
2. GREEN: the same command passed after adding the repository factory and compatibility export.
3. The stateful Supabase harness then ran C01's three conformance groups. Its initial run exposed an unmapped `archive_contributions` state collection in the test harness; after correcting the harness mapping, the focused repository/client/admin run passed 19 tests.

## Verification

- `node --test tests/supabase-archive-workflow-repository.test.mjs tests/archive-workflow-client.test.mjs tests/archive-admin-workflow.test.mjs` — 19 passing, 0 failing.
- `npm.cmd test` — 145 passing, 0 failing.
- `npm.cmd run build` — exited 0; Vite emitted only its existing large-chunk advisory.
- `git diff --check` — exited 0.

## Scope boundaries

No local engine work, visual changes, deployments, or edits to `docs/reports`, old plans, `tmp`, or `supabase/.temp` were made.
