# Staging Evidence Completion Packet

Version: `202607270013`
Stream: `legal_document_runtime`
Route: `repair_only`
File: `202607270013_final_mandate_completion_terminal_state.sql`
Evidence: `docs/staging-evidence/202607270013-legal_document_runtime.json`
Status: Pending

## Commands

```bash
node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607270013 --evidence docs/staging-evidence/202607270013-legal_document_runtime.json --confirm APPLY_TO_STAGING_ONLY
```

## Required Evidence

- Real staging project ref in `targetProjectRef` and `stagingProjectRef`
- `sqlApplied: false`
- `stagingLedgerRecorded: true`
- `catalogChecks: "pass"`
- `behaviorChecks: "pass"`
- `rollbackOrNoResidue: "pass"`
- `reviewedBy`, `approvedBy`, and `capturedAt`


## Blockers

- `staging_project_ref_env_missing`
- `staging_db_url_env_missing`
- `staging_recovery_confirmation_missing`
- `staging_evidence_missing`
