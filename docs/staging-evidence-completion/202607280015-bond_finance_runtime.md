# Staging Evidence Completion Packet

Version: `202607280015`
Stream: `bond_finance_runtime`
Route: `apply_original`
File: `202607280015_guided_bond_application_phase8i_governance_reporting.sql`
Evidence: `docs/staging-evidence/202607280015-bond_finance_runtime.json`
Status: Complete

## Commands

```bash
node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607280015 --confirm APPLY_TO_STAGING_ONLY
```

```bash
node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607280015 --evidence docs/staging-evidence/202607280015-bond_finance_runtime.json --confirm APPLY_TO_STAGING_ONLY
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
