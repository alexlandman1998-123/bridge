# Staging Evidence Completion Packet

Version: `20260903094957`
Stream: `attorney_identity_access`
Route: `repair_only`
File: `20260903094957_retire_inactive_attorney_assignments.sql`
Evidence: `docs/staging-evidence/20260903094957-attorney_identity_access.json`
Status: Complete

## Commands

```bash
node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260903094957 --evidence docs/staging-evidence/20260903094957-attorney_identity_access.json --confirm APPLY_TO_STAGING_ONLY
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
