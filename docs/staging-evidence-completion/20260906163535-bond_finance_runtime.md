# Staging Evidence Completion Packet

Version: `20260906163535`
Stream: `bond_finance_runtime`
Route: `apply_original`
File: `20260906163535_corrective_bond_delivery_reminders.sql`
Evidence: `docs/staging-evidence/20260906163535-bond_finance_runtime.json`
Status: Pending

## Commands

```bash
node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260906163535 --confirm APPLY_TO_STAGING_ONLY
```

```bash
node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260906163535 --evidence docs/staging-evidence/20260906163535-bond_finance_runtime.json --confirm APPLY_TO_STAGING_ONLY
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
