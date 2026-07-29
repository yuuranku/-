# Task 1 report — cloud sticky-note persistence and repository contract

## Scope completed

- Added `202607290005_workspace_sticky_notes.sql` with shared note content and per-profile layout tables.
- Added RLS and grants so only enabled administrators and clerks can read notes, only enabled administrators can mutate note content, and every enabled administrator or clerk can read/write only their own layout rows.
- Preserved `workspace_notes.created_by` and `created_at` across updates and required inserts to use the authenticated principal identity.
- Extended the repository contract and result-shape validation with all six workspace-note APIs.
- Added Supabase PostgREST requests, text trimming, strict integer validation, write whitelisting, deterministic note ordering, profile-scoped layout reads, composite-key layout upserts, and explicit delete identities.
- Did not implement LOCAL persistence, controller/UI behavior, sticky-note visuals, or modify the clerk-native-editor plan.

## TDD evidence

Initial RED:

```text
node --test tests/archive-workflow-schema.test.mjs tests/archive-workflow-repository-contract.test.mjs tests/archive-workflow-repository-shapes.test.mjs tests/archive-workflow-client.test.mjs
tests 47; pass 38; fail 9
```

The failures were the intended missing migration, six missing contract methods/result shapes, and missing Supabase request methods.

Strict numeric-boundary RED:

```text
node --test --test-name-pattern="workspace note client rejects|workspace note layout client rejects" tests/archive-workflow-client.test.mjs
tests 2; pass 0; fail 2
```

Numeric strings and `null` initially reached the query boundary; validation was then tightened to accept only finite non-negative integer values.

GREEN:

```text
node --test tests/archive-workflow-schema.test.mjs tests/archive-workflow-repository-contract.test.mjs tests/archive-workflow-repository-shapes.test.mjs tests/archive-workflow-client.test.mjs
tests 47; pass 47; fail 0
```

Related Supabase repository regression:

```text
node --test tests/supabase-archive-workflow-repository.test.mjs
tests 15; pass 15; fail 0
```

## Security notes

- `workspace_notes` read policy requires `is_workspace_member()`; content insert/update/delete policies require `is_admin()`.
- `workspace_note_layouts` policies require both enabled workspace membership and `profile_id = auth.uid()` for reads and writes; no administrator bypass exists.
- `anon` receives no table privileges. `authenticated` receives only the table operations needed for PostgREST, with RLS as the final authorization boundary.
- No note RPC or service-role credential was added.
