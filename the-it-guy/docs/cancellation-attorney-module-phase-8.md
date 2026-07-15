# Cancellation attorney module - Phase 8 lodgement and registration evidence packet

Phase 8 closes the controlled blocker `cancellation_lodgement_registration_evidence_not_packet_bound`.

It binds cancellation lodgement and registration/discharge readiness to actual evidence artifacts instead of workflow-stage labels. The workspace only unlocks Phase 9 when Phase 7 document/signing readiness is clear and the required lodgement/registration evidence records are verified.

The executable source is `src/core/transactions/cancellationAttorneyModulePhase8.js`.

## What changed

- Added a cancellation lodgement/registration evidence packet for:
  - simultaneous lodgement readiness evidence
  - cancellation lodgement evidence
  - cancellation registration or discharge evidence
- Added evidence records with:
  - requirement key
  - evidence status
  - source type
  - artifact reference id
  - external reference
  - capture timestamp
  - verification timestamp
  - verifier identity
- Added canonical-fact binding for:
  - `guarantee_acceptance_status`
  - `signed_cancellation_document_status`
  - `lodgement_reference`
  - `lodgement_date`
  - `cancellation_registration_reference`
  - `cancellation_registration_date`
- Added a Phase 7 gate: the document/signing workspace must be ready before lodgement and registration evidence can unlock the next phase.
- Added rejection of stage-only or system-generated “evidence”.
- Added future-date checks for lodgement and registration dates.
- Added figures-validity checks so lodgement evidence cannot be treated as ready if cancellation figures expired before lodgement.
- Added redacted audit metadata. The audit event includes requirement status, fingerprints and artifact ids, not fact values, document bodies, template content or evidence payloads.

## Evidence requirements

Phase 8 requires these packet-bound evidence records:

- `simultaneous_lodgement_readiness_evidence`
- `lodgement_evidence`
- `cancellation_registration_evidence`

Each record must be verified and linked to a real external/uploaded artifact. Workflow-stage text is not enough.

## Controls

Phase 8 enforces these controls in code:

- Phase 7 document/signing workspace must be ready.
- Canonical lodgement and registration facts must be verified.
- Every required evidence record must exist.
- Every required evidence record must be verified.
- Every evidence record must link to an artifact/reference id.
- Stage-only evidence is rejected.
- System-generated evidence is rejected.
- Future lodgement or registration dates block readiness.
- Registration before lodgement blocks readiness.
- Expired cancellation figures block lodgement readiness.

## Phase 8 boundary

This phase intentionally does not:

- infer registration from a stage label
- synthesize lodgement outcomes
- synthesize registration or discharge outcomes
- submit anything to an existing-lender portal
- integrate with Deeds Office systems
- generate legal instruments
- reconcile settlement
- write to external systems
- mutate the matter

It is a packet-bound evidence and readiness gate only.

## Why this helps the cancellation attorney

The cancellation team can now distinguish “the file says cancellation registered” from “we have verified cancellation registration/discharge evidence attached to the packet.”

For the conveyancer, this removes a dangerous grey zone: lodgement and cancellation registration become evidence-backed facts they can rely on before settlement close-out begins in Phase 9.

## Acceptance check

Run:

```bash
npm run test:cancellation-attorney-module-phase8
```

Phase 8 is complete when Phases 0-7 still pass, all three evidence requirements can be packet-bound, missing registration evidence blocks readiness, stage-only evidence is rejected, future registration dates are blocked, expired figures are caught, Phase 7 readiness is required, and audit metadata stays redacted.
