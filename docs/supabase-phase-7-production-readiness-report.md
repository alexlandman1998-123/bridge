# Supabase Phase 7 — Production Promotion Readiness

## Outcome

Phase 7 has been implemented as a fail-closed production-promotion gate.

- Production project: `isdowlnollckzvltkasn`
- Production SQL promoted: 36 migrations across six batches
- Production migration ledger: 469 rows; all Batch 1–6 versions recorded
- Staging manifest coverage: 67 of 67, recertified in Phase 22
- Staging evidence coverage: complete
- Production physical backups: 8 completed
- Production PITR: disabled
- Attorney integrity gate: passed
- Historical ineligible attorney assignments: 0
- Human staging-readiness approval: Alexander Landman
- Phase 7 gate tests: passed
- Phase 14 production history reconciliation: passed

The prerequisite gates pass. Phase 15 Batches 1–6 completed with reviewed production evidence. The remaining 31 manifest versions remain final-closeout blockers. The duplicate local version was resolved in Phase 19.

## Implemented controls

Every production mutation now requires three independent evidence layers:

1. Per-migration staging evidence proving catalogue, behaviour, and rollback/no-residue checks.
2. A manifest-wide staging readiness record proving all 67 migrations are ledgered and evidenced, with a passing attorney integrity gate and zero blocking assignments.
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

- 67 manifest rows;
- 67 staging ledger entries;
- complete staging evidence;
- zero blocking attorney assignments after the Phase 10 remediation;
- eight completed production physical backups;
- Phase 11 approval by Alexander Landman;
- Phase 12 database recovery evidence approved by Alexander Landman;
- Phase 13 short-lived production access and runtime recovery confirmation configured.
- Phase 14 canonical production ledger history recorded with zero genuine remote-only drift.
- Phase 15 Batch 1 production evidence complete for `202607170026`, `202607170027`, and `202607170028`.
- Phase 15 Batch 2 production evidence complete for the eight `legal_review_assurance` versions.
- Phase 15 Batch 3 production evidence complete for the seven legal-document runtime-foundation versions.
- Phase 15 Batch 4 production evidence complete for the eight editable-document and certified-PDF runtime versions.
- Phase 15 Batch 5 production evidence complete for the nine signing-and-completion runtime versions.
- Phase 15 Batch 6 production evidence complete for the document-experience runtime enforcement capstone.

## Required work before the next production batch

1. Select and preflight the next dependency stream.
2. Continue one migration version at a time, stopping for production verification before each ledger update.
3. Keep the Phase 0 broad-push guard active until all 67 rows have reviewed production evidence.

## Files changed

- `scripts/supabase-phase7-production-execution.mjs`
- `scripts/supabase-phase7-production-execution.test.mjs`
- `.github/workflows/supabase-phase7-production-gate.yml`
- `docs/supabase-phase-7-staging-readiness.json`
- `docs/supabase-phase-7-implementation-status.md`
- `docs/database-release-runbook.md`

Phase 15 Batches 1–6 applied 36 reviewed migrations and retained per-version production evidence.
