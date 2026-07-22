# Phase 18 — Phase 1 Release Scope

## Decision

**Status: PHASE_1_SCOPE_AMENDED_PHASE_32**

Phase 1 is a controlled residential-transaction pilot for one organisation. It must prove seller onboarding, eligible attorney assignment, transaction creation, mandate and OTP generation, editing/autosave, deterministic PDF generation, signing, final publication, conditional legal masters, and controlled rollout.

## Included production work

- 11 `document_generation` manifest migrations, completed in Phase 23 with one additive least-privilege correction.
- 6 `attorney_identity_access` manifest migrations, completed in Phase 24 with two additive corrections and the reviewed 43-assignment remediation.
- Repair-only verification and ledger reconciliation for `202607180046` transaction creation, completed in Phase 25 with additive least-privilege correction `202607209903`.
- `20260719194500` seller attorney acceptance, completed in Phase 25.
- The three conditional-master migrations `202607200004`–`202607200006`, promoted and verified in Phase 31 without activating an organisation rollout.
- A clean, reproducible application deployment followed by one enforced N6 pilot cohort.

Phases 29–32 explicitly amended the scope to promote the staging-certified attorney-accounting, attorney-calendar, conditional-legal-master, seller-attorney-resolution, and canonical-partner streams. All 78 governed rows now have reviewed production evidence and production has 511 ledger rows.

## Explicitly deferred

- Multi-organisation and full production rollout.

Deferred work remains required for final production closeout, but it may not enter the Phase 1 pilot-preparation batches without an explicit scope amendment.

## Pilot boundary

- One organisation.
- Three to five recommended users; hard ceiling of ten participants.
- Two or three controlled transactions.
- Seven-day observation window.
- Phase 0 broad migration guard remains active because the later local-only `202607200014` migration is outside the certified Phase 32 scope.

## Change control

No new capability may be added implicitly. Any proposed addition must identify its application files, migrations, staging evidence, production risk, rollback strategy, and impact on the pilot schedule, then receive explicit approval before this scope contract is amended.
