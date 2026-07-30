# Staging Evidence Completion Packet

Version: `202607280006`
Stream: `bond_finance_runtime`
Route: `apply_original`
File: `202607280006_guided_bond_application_phase8_external_exports.sql`
Evidence: `docs/staging-evidence/202607280006-bond_finance_runtime.json`
Status: Complete

## Commands

```bash
node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607280006 --confirm APPLY_TO_STAGING_ONLY
```

```bash
node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607280006 --evidence docs/staging-evidence/202607280006-bond_finance_runtime.json --confirm APPLY_TO_STAGING_ONLY
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

- None
