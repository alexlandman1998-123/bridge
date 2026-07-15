# Bond attorney module - Phase 8 lodgement and registration evidence packet

Phase 8 closes the Phase 0 blocker `lodgement_registration_evidence_not_packet_bound`. It binds lodgement and registration readiness to actual evidence artifacts instead of workflow-stage labels.

The executable source is `src/core/transactions/bondAttorneyModulePhase8.js`.

## What changed

- Added a lodgement/registration evidence packet for:
  - bank approval to lodge
  - guarantee values and expiry evidence
  - lodgement evidence
  - Deeds Office / registration evidence
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
  - `approval_to_lodge_reference`
  - `guarantee_values_and_expiry`
  - `lodgement_reference`
  - `registration_date`
  - `title_deed_or_deeds_office_reference`
- Added guarantee-expiry checks.
- Added rejection of stage-only or system-generated “evidence”.
- Added a Phase 7 gate: governed legal-template readiness must pass before the lodgement evidence packet can unlock the next phase.
- Added redacted audit metadata. The audit event includes requirement status, fingerprints and artifact ids, not fact values, document bodies, template content or signer payloads.

## Evidence requirements

Phase 8 requires these packet-bound evidence records:

- `bank_approval_to_lodge`
- `guarantee_evidence`
- `lodgement_evidence`
- `deeds_registration_evidence`

Each record must be verified and linked to a real external/uploaded artifact. Workflow-stage text is not enough.

## Controls

Phase 8 enforces these controls in code:

- Phase 7 governed-template gate must be ready.
- Canonical lodgement/registration facts must be verified.
- Every required evidence record must exist.
- Every required evidence record must be verified.
- Every evidence record must link to an artifact/reference id.
- Stage-only evidence is rejected.
- System-generated evidence is rejected.
- Expired guarantee evidence blocks readiness.
- Future registration dates block readiness.

## Phase 8 boundary

This phase intentionally does not:

- synthesize bank approval to lodge
- synthesize a Deeds Office outcome
- submit anything to a bank
- integrate with Deeds Office systems
- generate legal instruments
- mutate registry outcomes

It is a packet-bound evidence and readiness gate only.

## Why this helps the bond attorney

The bond team can now distinguish “the file says it is registered” from “we have verified registration evidence attached to the bond packet.”

That is the whole point of Phase 8: lodgement and registration stop being stage labels and become evidence-backed facts the conveyancer can trust.

## Acceptance check

Run:

```bash
npm run test:bond-attorney-module-phase8
```

Phase 8 is complete when Phases 0-7 still pass, all four evidence requirements can be packet-bound, missing registration evidence blocks readiness, stage-only evidence is rejected, expired guarantees block readiness, Phase 7 readiness is required, and audit metadata stays redacted.
