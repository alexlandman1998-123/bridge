# Staging Evidence Completion Packet

Version: `202607280014`
Stream: `bond_finance_runtime`
Route: `apply_original`
File: `202607280014_guided_bond_application_phase8h_recipient_specific_formats.sql`
Evidence: `docs/staging-evidence/202607280014-bond_finance_runtime.json`
Status: Pending

## Commands

```bash
node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607280014 --confirm APPLY_TO_STAGING_ONLY
```

```bash
node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607280014 --evidence docs/staging-evidence/202607280014-bond_finance_runtime.json --confirm APPLY_TO_STAGING_ONLY
```

## Required Evidence

- Real staging project ref in `targetProjectRef` and `stagingProjectRef`
- `sqlApplied: true`
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
