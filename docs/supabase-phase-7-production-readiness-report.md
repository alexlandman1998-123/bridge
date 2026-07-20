# Supabase Phase 7 — Production Promotion Readiness

## Outcome

Phase 7 has been implemented as a fail-closed production-promotion gate.

- Production project: `isdowlnollckzvltkasn`
- Production SQL applied: no
- Production migration ledger changed: no
- Staging manifest coverage: 64 of 64
- Staging evidence coverage: complete
- Production physical backups: 8 completed
- Production PITR: disabled
- Attorney integrity gate: passed
- Historical ineligible attorney assignments: 0
- Human staging-readiness approval: Alexander Landman
- Phase 7 gate tests: passed
- Phase 14 production history reconciliation: passed

The staging technical prerequisites, human approval, database recovery proof, short-lived production access, and production history reconciliation now pass. Resolve the unrelated duplicate local version `202607200002`, then controlled production promotion may proceed one reviewed migration at a time.

## Implemented controls

Every production mutation now requires three independent evidence layers:

1. Per-migration staging evidence proving catalogue, behaviour, and rollback/no-residue checks.
2. A manifest-wide staging readiness record proving all 64 migrations are ledgered and evidenced, with a passing attorney integrity gate and zero blocking assignments.
3. Per-migration production evidence before the production ledger can be recorded.

The manifest-wide readiness record also requires a human `approvedBy` value. Automated migration verification cannot authorize production by itself.

The runner continues to require:

- the exact fixed production project identity;
- an identity-matching production database URL;
- explicit tested-recovery attestation;
- a live PITR or physical-backup check;
- one exact migration version per invocation;
- recorded stream dependencies;
- separate SQL-application and ledger-recording steps;
- no SQL replay for repair-only migrations;
- out-of-band review for corrective and manual-data migrations.

## Fail-closed verification history

Before Phases 10–14 were completed, the production runner was invoked with:

- a real Phase 2 staging evidence file;
- the current Phase 7 staging-readiness record;
- the explicit production confirmation phrase.

It stopped before reading production credentials or attempting a mutation because the readiness status at that time was `BLOCKED_ATTORNEY_INTEGRITY`. That historical check proved the global safety gate was active. The current readiness record is approved; Phase 14 then reconciled migration-history metadata without using the Phase 7 SQL-promotion path.

## Current readiness record

The machine-readable state is stored in `docs/supabase-phase-7-staging-readiness.json` and records:

- 64 manifest rows;
- 64 staging ledger entries;
- complete staging evidence;
- zero blocking attorney assignments after the Phase 10 remediation;
- eight completed production physical backups;
- Phase 11 approval by Alexander Landman;
- Phase 12 database recovery evidence approved by Alexander Landman;
- Phase 13 short-lived production access and runtime recovery confirmation configured.
- Phase 14 canonical production ledger history recorded with zero genuine remote-only drift.

## Required work before production

1. Resolve the unrelated duplicate local migration version `202607200002`.
2. Promote one dependency stream and one migration version at a time, stopping for production verification before each ledger update.

## Files changed

- `scripts/supabase-phase7-production-execution.mjs`
- `scripts/supabase-phase7-production-execution.test.mjs`
- `.github/workflows/supabase-phase7-production-gate.yml`
- `docs/supabase-phase-7-staging-readiness.json`
- `docs/supabase-phase-7-implementation-status.md`
- `docs/database-release-runbook.md`

Phase 14 changed migration-history metadata only; production schema and application data remain untouched.
