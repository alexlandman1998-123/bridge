# Document Request Phase 15: Operational Preflight

Phase 15 verifies that the document-request rollout path is ready for a controlled dry-run after the local parity gates.

## Scope

- Confirms Phase 10 through Phase 14 reports are present, matched, read-only, and free of hard failures.
- Requires Phase 11 through Phase 14 to be clean and production-activation ready.
- Allows the managed Phase 10 warnings to remain classified rather than treating them as new blockers.
- Verifies the existing operational rollout script defaults to dry-run.
- Verifies rollout writes require both `--commit` and `--confirm-operational-rollout`.
- Verifies rollout size is capped and active portal access is audited.
- Verifies existing uploaded/review rows and `document_requests` row deltas are audited.
- Verifies the rollout path does not write client-facing `document_requests` rows.
- Verifies the live portal postcheck script remains part of the rollout path and does not expose raw portal tokens.

## Out Of Scope

- Document generator workflow, wording, policy drafting, generated legal documents, and signing flows remain out of scope.
- This phase does not connect to Supabase.
- This phase does not run live portal verification.
- This phase does not execute a rollout commit.

## Verification

Run:

```bash
npm run verify:document-request-phase15-operational-preflight
```

The command chains Phase 14 verification, the Phase 15 contract test, and the Phase 15 report.

Report output:

```text
output/document-request-phase15-operational-preflight.json
```
