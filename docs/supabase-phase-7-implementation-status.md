# Supabase Phase 7 Implementation Status

Generated: 2026-07-19
Production project: `isdowlnollckzvltkasn` (`Arch9 SaaS`)

## Decision

**Status: PRODUCTION_PROMOTION_GATE_READY — BLOCKED_STAGING_AND_RECOVERY**

Phase 7 implements a fail-closed, manifest-driven production promotion mechanism. No production SQL was applied and the production migration ledger was not changed: Phase 6 has not run against an Arch9 staging project, and the latest production check found PITR disabled with no physical backups returned.

## Implemented Controls

- Planning is read-only and covers all 63 Phase 5 manifest rows.
- Production mutations require the exact project reference `isdowlnollckzvltkasn` and a database URL containing that identity.
- A live pre-mutation backup check requires PITR or at least one physical backup.
- Operators must explicitly attest tested recovery and pass `--confirm APPLY_TO_PRODUCTION`.
- Every mutation is limited to one exact migration version.
- Reviewed staging evidence is mandatory for both SQL application and ledger recording.
- Stream dependencies represented by migration versions must already be recorded in production.
- SQL application and ledger recording are separate invocations.
- Production ledger recording requires a second reviewed evidence file produced after live verification.
- `corrective_migration_required` and `manual_data_review` rows cannot be mutated by the runner.
- `repair_only_after_smoke` rows cannot replay SQL and may only be recorded after both evidence gates pass.

## Current Blockers

| Gate | Current result |
| --- | --- |
| Dedicated Arch9 staging target | Not identified |
| Phase 6 staging evidence | Not available |
| Production PITR | Disabled |
| Production physical backups | None returned |
| Production recovery test | Not evidenced |
| Production SQL applied in Phase 7 | No |
| Production ledger changed in Phase 7 | No |

## Usage

Review the production plan without connecting to Supabase:

```bash
npm run supabase:phase7:production -- --stream settings_governance
```

After staging completion and production recovery testing, provide credentials through a secure environment:

```bash
export SUPABASE_PRODUCTION_PROJECT_REF='isdowlnollckzvltkasn'
export SUPABASE_PRODUCTION_DB_URL='<percent-encoded-production-postgres-url>'
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
  --production-evidence '<production-evidence>.json' \
  --confirm APPLY_TO_PRODUCTION
```

## Handoff

1. Provision or identify the Arch9 staging project and complete Phase 6 one version at a time.
2. Enable PITR or establish a physical production backup, then perform and document a recovery test.
3. Promote the smallest dependency stream one exact version at a time.
4. Stop between SQL application and ledger recording for production verification and review.
