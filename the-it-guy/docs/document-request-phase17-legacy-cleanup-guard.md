# Document Request Phase 17: Legacy Cleanup Guard

Phase 17 verifies that the legacy required-document cleanup path is safe before any operational cleanup dry-run or commit.

## Scope

- Confirms Phase 16 automation handoff is clean and did not execute live automation.
- Verifies the existing cleanup script defaults to dry-run.
- Verifies cleanup writes require `--commit` and `--confirm-legacy-cleanup`.
- Verifies cleanup uses Phase 15 rollout evidence as a precheck.
- Verifies cleanup runs Phase 16 automation as a postcheck after commit.
- Verifies cleanup scope is capped.
- Verifies uploaded, verified, rejected, and review-state rows are skipped.
- Verifies eligible legacy rows are disabled and hidden instead of deleted.
- Verifies cleanup does not write client-facing `document_requests` rows.
- Verifies portal verification excludes inactive cleanup rows from non-canonical blocker counts.

## Out Of Scope

- Document generator workflow, wording, policy drafting, generated legal documents, and signing flows remain out of scope.
- This phase does not connect to Supabase.
- This phase does not run the cleanup dry-run.
- This phase does not execute a cleanup commit.

## Verification

Run:

```bash
npm run verify:document-request-phase17-legacy-cleanup-guard
```

The command chains Phase 16 verification, the Phase 17 contract test, and the Phase 17 report.

Report output:

```text
output/document-request-phase17-legacy-cleanup-guard.json
```
