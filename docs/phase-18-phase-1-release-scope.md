# Phase 18 — Phase 1 Release Scope

## Decision

**Status: PHASE_1_SCOPE_LOCKED**

Phase 1 is a controlled residential-transaction pilot for one organisation. It must prove seller onboarding, eligible attorney assignment, transaction creation, mandate and OTP generation, editing/autosave, deterministic PDF generation, signing, final publication, conditional legal masters, and controlled rollout.

## Included production work

- 11 `document_generation` manifest migrations, completed in Phase 23 with one additive least-privilege correction.
- 6 outstanding `attorney_identity_access` manifest migrations, including separately reviewed corrective work where required.
- Repair-only verification and ledger reconciliation for `202607180046` transaction creation.
- `20260719194500` seller attorney acceptance.
- The three conditional-master migrations assigned to unique consecutive versions `202607200004`–`202607200006`; they are governed and staging-certified but still require production promotion.
- A clean, reproducible application deployment followed by one enforced N6 pilot cohort.

Phase 23 completed document-generation promotion and its security correction. Twenty of the 68 governed manifest rows remain without reviewed production evidence.

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
