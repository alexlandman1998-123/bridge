# Cancellation attorney module - Phase 9 settlement and close-out packet

Phase 9 closes the controlled blocker `settlement_closeout_packet_missing`.

It creates a packet-bound settlement and close-out gate after Phase 8 lodgement/registration evidence. The packet reconciles settlement proof to verified cancellation figures, ties lender confirmation to the registration and payment references, and blocks close-out while unresolved exceptions remain.

The executable source is `src/core/transactions/cancellationAttorneyModulePhase9.js`.

## What changed

- Added a settlement/close-out packet for:
  - settlement payment proof
  - existing-lender settlement confirmation
  - cancellation close-out review evidence
- Added settlement evidence records with:
  - requirement key
  - evidence status
  - source type
  - artifact reference id
  - payment reference
  - registration reference where applicable
  - payment date
  - capture timestamp
  - verification timestamp
  - verifier identity
- Added canonical-fact binding for:
  - `settlement_amount`
  - `settlement_payment_reference`
  - `cancellation_registration_reference`
  - `cancellation_registration_date`
  - `closeout_status`
- Added a Phase 8 gate: lodgement and registration evidence must be packet-bound before settlement close-out can unlock the next phase.
- Added a figures gate: Phase 5 cancellation figures must be ready before settlement proof can be treated as reconciled.
- Added checks for:
  - settlement proof amount matching the canonical settlement amount
  - canonical settlement amount matching the active figures register amount
  - payment reference consistency
  - lender registration reference consistency
  - settlement not predating registration
  - figures not expiring before settlement
  - close-out status being complete
  - unresolved close-out exceptions
- Added rejection of stage-only or system-generated “settlement evidence”.
- Added redacted audit metadata. The audit event includes requirement status, fingerprints, metrics and references, not fact values, settlement evidence payloads or document bodies.

## Evidence requirements

Phase 9 requires these packet-bound evidence records:

- `settlement_payment_evidence`
- `lender_settlement_confirmation`
- `closeout_review_evidence`

Each record must be verified and linked to a real external/uploaded artifact. A close-out status label is not enough.

## Controls

Phase 9 enforces these controls in code:

- Phase 8 lodgement/registration packet must be ready.
- Phase 5 figures register must be ready.
- Canonical settlement and close-out facts must be verified.
- Settlement proof must exist and be verified.
- Lender settlement confirmation must exist and be verified.
- Close-out review evidence must exist and be verified.
- Settlement amount must reconcile to the active cancellation figures.
- Payment and registration references must reconcile.
- Stage-only evidence is rejected.
- System-generated evidence is rejected.
- Unresolved close-out exceptions block readiness.

## Phase 9 boundary

This phase intentionally does not:

- execute settlement payments
- request external settlement automatically
- synthesize payment confirmation
- synthesize lender discharge confirmation
- submit anything to an existing-lender portal
- integrate with Deeds Office systems
- write to external systems
- mutate the matter

It is a settlement reconciliation and close-out readiness gate only.

## Why this helps the cancellation attorney

The cancellation team can now answer: “Can we safely close this cancellation file?” without manually reconciling figures, proof of payment, lender confirmation, registration evidence and exception notes.

For the conveyancer, Phase 9 makes close-out concrete: no proof, no lender confirmation, no reconciliation, no close-out. The module can guide the secretary or conveyancer to the exact missing item instead of burying the problem in a stage label.

## Acceptance check

Run:

```bash
npm run test:cancellation-attorney-module-phase9
```

Phase 9 is complete when Phases 0-8 still pass, all three settlement evidence requirements can be packet-bound, missing proof blocks readiness, settlement amount mismatches are caught, stage-only evidence is rejected, unresolved exceptions block close-out, Phase 8 readiness is required, the figures gate is required, and audit metadata stays redacted.
