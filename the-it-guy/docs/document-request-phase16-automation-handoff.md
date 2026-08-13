# Document Request Phase 16: Automation Handoff

Phase 16 verifies that the guarded automation path is ready to be handed to operations after the local preflight gate.

## Scope

- Confirms Phase 15 operational preflight is clean and did not execute a live rollout.
- Verifies the automation runner reuses the guarded Phase 15 rollout.
- Verifies automation defaults to dry-run.
- Verifies writes require `--commit` and `--confirm-automation`.
- Verifies commit mode runs a preflight before attempting writes.
- Verifies legacy non-canonical rows block automation unless an explicit override is provided.
- Verifies the cron endpoint requires `CRON_SECRET`.
- Verifies the cron endpoint writes only when `DOCUMENT_REQUEST_CANONICAL_AUTOMATION_COMMIT=true`.
- Verifies the cron endpoint response is sanitized and does not expose raw portal tokens.
- Verifies the scheduled cron registration exists exactly once.

## Out Of Scope

- Document generator workflow, wording, policy drafting, generated legal documents, and signing flows remain out of scope.
- This phase does not connect to Supabase.
- This phase does not invoke the live automation runner.
- This phase does not execute a rollout dry-run or commit.

## Verification

Run:

```bash
npm run verify:document-request-phase16-automation-handoff
```

The command chains Phase 15 verification, the Phase 16 contract test, and the Phase 16 report.

Report output:

```text
output/document-request-phase16-automation-handoff.json
```
