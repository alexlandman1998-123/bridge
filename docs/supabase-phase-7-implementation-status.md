# Supabase Phase 7 Implementation Status

Generated: 2026-07-20
Production project: `isdowlnollckzvltkasn` (`Arch9 SaaS`)

## Decision

**Status: READY_FOR_CONTROLLED_PRODUCTION_PROMOTION**

Phase 7 implements a fail-closed, manifest-driven production promotion mechanism. Staging has all 64 manifest versions recorded with complete migration evidence. Phases 10–14 cleared the prerequisite integrity, certification, recovery, access, and history gates. Phase 15 Batch 1 then promoted the three `settings_governance` versions one at a time with production verification between SQL application and ledger recording.

## Implemented Controls

- Planning is read-only and covers all 64 Phase 5 manifest rows.
- Production mutations require the exact project reference `isdowlnollckzvltkasn`, the `linked_ephemeral` access mode, and a linked-project identity check.
- A live pre-mutation backup check requires PITR or at least one physical backup.
- Operators must explicitly attest tested recovery and pass `--confirm APPLY_TO_PRODUCTION`.
- Every mutation is limited to one exact migration version.
- Reviewed staging evidence is mandatory for both SQL application and ledger recording.
- A manifest-wide staging readiness record is mandatory for every production mutation.
- The readiness record must prove all 64 manifest versions are ledgered, evidence is complete, the attorney integrity gate passes, and the blocking assignment count is zero.
- The readiness record requires a human `approvedBy` value; migration-level automated evidence cannot self-authorize production.
- Stream dependencies represented by migration versions must already be recorded in production.
- SQL application and ledger recording are separate invocations.
- Production ledger recording requires a second reviewed evidence file produced after live verification.
- `corrective_migration_required` and `manual_data_review` rows cannot be mutated by the runner.
- `repair_only_after_smoke` rows cannot replay SQL and may only be recorded after both evidence gates pass.

## Current Blockers

| Gate | Current result |
| --- | --- |
| Dedicated Arch9 staging target | Healthy: `vaszuxjeoajeuhlcnzzf` |
| Staging manifest ledger | 64/64 recorded |
| Staging migration evidence | Complete |
| Attorney integrity gate | Passed: 0 blocking assignments |
| Production PITR | Disabled |
| Production physical backups | 8 completed |
| Human staging-readiness approval | Alexander Landman |
| Production access | Configured: short-lived linked login role |
| Production database recovery test/attestation | Proven and approved in Phase 12 |
| Production migration history | Reconciled: 0 genuine remote-only versions |
| Duplicate local migration version | `202607200002` must be resolved |
| Production SQL promoted through the Phase 7 gate | 3/64 (`202607170026`–`202607170028`) |
| Production closeout evidence | 3/64 complete |
| Production ledger | 436 rows after Batch 1 |

## Usage

Review the production plan without connecting to Supabase:

```bash
npm run supabase:phase7:production -- --stream settings_governance
```

After staging completion and production recovery testing, provide credentials through a secure environment:

```bash
export SUPABASE_PRODUCTION_PROJECT_REF='isdowlnollckzvltkasn'
export SUPABASE_PRODUCTION_ACCESS_MODE='linked_ephemeral'
export SUPABASE_PRODUCTION_RECOVERY_CONFIRMED='I_HAVE_TESTED_PRODUCTION_RECOVERY'
```

The reviewed staging promotion evidence must contain:

```json
{
  "version": "202607170026",
  "stagingProjectRef": "<non-production-project-ref>",
  "stagingLedgerRecorded": true,
  "catalogChecks": "pass",
  "behaviorChecks": "pass",
  "rollbackOrNoResidue": "pass",
  "approvedBy": "<approver>"
}
```

Apply one eligible migration without changing the production ledger:

```bash
node scripts/supabase-phase7-production-execution.mjs \
  --apply-sql \
  --version 202607170026 \
  --staging-evidence '<staging-evidence>.json' \
  --staging-readiness 'docs/supabase-phase-7-staging-readiness.json' \
  --recovery-evidence 'migration-evidence/2026-07-20-production-recovery-phase12/production-database-recovery.json' \
  --confirm APPLY_TO_PRODUCTION
```

After production checks pass, prepare production evidence. For an applied SQL row, `sqlApplied` must be `true`; for a repair-only row it must be `false`:

```json
{
  "version": "202607170026",
  "targetProjectRef": "isdowlnollckzvltkasn",
  "sqlApplied": true,
  "targetStateVerified": true,
  "catalogChecks": "pass",
  "behaviorChecks": "pass",
  "rollbackOrNoResidue": "pass",
  "reviewedBy": "<reviewer>"
}
```

Then record only that exact version:

```bash
node scripts/supabase-phase7-production-execution.mjs \
  --record-applied \
  --version 202607170026 \
  --staging-evidence '<staging-evidence>.json' \
  --staging-readiness 'docs/supabase-phase-7-staging-readiness.json' \
  --recovery-evidence 'migration-evidence/2026-07-20-production-recovery-phase12/production-database-recovery.json' \
  --production-evidence '<production-evidence>.json' \
  --confirm APPLY_TO_PRODUCTION
```

## Handoff

1. Promote the smallest dependency stream one exact version at a time.
2. Stop between SQL application and ledger recording for production verification and review.
