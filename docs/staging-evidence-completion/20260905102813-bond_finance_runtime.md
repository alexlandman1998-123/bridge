# Staging Evidence Completion Packet

Version: `20260905102813`
Stream: `bond_finance_runtime`
Route: `apply_original`
File: `20260905102813_bond_application_portal_phase7_submission_readiness.sql`
Evidence: `docs/staging-evidence/20260905102813-bond_finance_runtime.json`
Status: Pending

## Commands

```bash
node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260905102813 --confirm APPLY_TO_STAGING_ONLY
```

```bash
node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260905102813 --evidence docs/staging-evidence/20260905102813-bond_finance_runtime.json --confirm APPLY_TO_STAGING_ONLY
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

- `staging_evidence_missing`
