# Task 2 report — LOCAL workspace-note persistence and legacy compatibility

## Scope completed

- Added `workspaceNotes` and `workspaceNoteLayouts` to the default LOCAL state.
- Added all six workspace-note APIs to the transactional LOCAL engine and its returned repository surface.
- Restricted shared-content mutations to enabled administrators; enabled clerks can read content and save/read only their own layouts; observer and disabled principals are denied.
- Kept layouts isolated by `(note_id, profile_id)` and cascade-removed layouts when an administrator deletes a note.
- Added strict trimmed text, non-negative integer sort-order, and finite non-negative integer coordinate validation.
- Normalized old 13-store IndexedDB state before local repository validation, without changing the database name or discarding existing records.
- Bumped exported snapshots to schema v2 while accepting checksum-valid schema v1 snapshots and adding only the two missing empty arrays after checksum verification.
- Did not modify the SDD ledger or any Task 7/UI file.

## TDD evidence

Initial RED:

```text
node --test tests/local-workflow-engine.test.mjs tests/local-indexeddb-browser.test.mjs
tests 70; pass 60; fail 10
```

The intended failures covered the missing state stores and methods, v1-only snapshot export, legacy IndexedDB normalization, and the new six-method repository-contract conformance requirement.

Focused GREEN:

```text
node --test --test-name-pattern="workspace note|empty local state|snapshot export and import preserve|legacy IndexedDB state|invalid snapshots" tests/local-workflow-engine.test.mjs tests/local-indexeddb-browser.test.mjs
tests 8; pass 8; fail 0
```

Task 2 GREEN:

```text
node --test tests/local-workflow-engine.test.mjs tests/local-indexeddb-browser.test.mjs
tests 70; pass 70; fail 0
```

Task 1 regression:

```text
node --test tests/archive-workflow-schema.test.mjs tests/archive-workflow-repository-contract.test.mjs tests/archive-workflow-repository-shapes.test.mjs tests/archive-workflow-client.test.mjs
tests 47; pass 47; fail 0
```

## Compatibility notes

- A schema v1 snapshot is checksum-validated in its original 13-store form before it is normalized, so malformed checksums cannot bypass the upgrade.
- Schema v2 snapshots must already contain all stores; missing or malformed stores still fail shape validation.
- An existing old IndexedDB state is normalized only at the local repository boundary. Its archive and contribution stores are retained intact, and the normalized form is persisted on the next successful transaction.
