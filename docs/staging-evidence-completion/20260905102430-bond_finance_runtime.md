# Staging Evidence Completion Packet

Version: `20260905102430`
Stream: `bond_finance_runtime`
Route: `apply_original`
File: `20260905102430_bond_application_portal_phase6_document_continuity.sql`
Evidence: `docs/staging-evidence/20260905102430-bond_finance_runtime.json`
Status: Pending

## Commands

```bash
node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260905102430 --confirm APPLY_TO_STAGING_ONLY
```

```bash
node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260905102430 --evidence docs/staging-evidence/20260905102430-bond_finance_runtime.json --confirm APPLY_TO_STAGING_ONLY
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
