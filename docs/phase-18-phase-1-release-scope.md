# Phase 18 — Phase 1 Release Scope

## Decision

**Status: PHASE_1_SCOPE_LOCKED**

Phase 1 is a controlled residential-transaction pilot for one organisation. It must prove seller onboarding, eligible attorney assignment, transaction creation, mandate and OTP generation, editing/autosave, deterministic PDF generation, signing, final publication, conditional legal masters, and controlled rollout.

## Included production work

- 11 outstanding `document_generation` manifest migrations.
- 6 outstanding `attorney_identity_access` manifest migrations, including separately reviewed corrective work where required.
- Repair-only verification and ledger reconciliation for `202607180046` transaction creation.
- `20260719194500` seller attorney acceptance.
- The three conditional-master migrations now assigned to unique consecutive versions `202607200004`–`202607200006`; they still require governed-manifest inclusion and staging certification.
- A clean, reproducible application deployment followed by one enforced N6 pilot cohort.

This locks 19 of the existing 28 outstanding manifest rows into pilot preparation. Phase 19 repaired the conditional-master inventory; the chain adds three pending items after manifest inclusion and staging certification.

## Explicitly deferred

- Eight attorney-accounting migrations.
- Attorney-calendar RSVP repair `202607180047`.
- Client proof uploads and statements.
- Multi-organisation and full production rollout.

Deferred work remains required for final production closeout, but it may not enter the Phase 1 pilot-preparation batches without an explicit scope amendment.

## Pilot boundary

- One organisation.
- Three to five recommended users; hard ceiling of ten participants.
- Two or three controlled transactions.
- Seven-day observation window.
- Phase 0 broad migration guard remains active.

## Change control

No new capability may be added implicitly. Any proposed addition must identify its application files, migrations, staging evidence, production risk, rollback strategy, and impact on the pilot schedule, then receive explicit approval before this scope contract is amended.
