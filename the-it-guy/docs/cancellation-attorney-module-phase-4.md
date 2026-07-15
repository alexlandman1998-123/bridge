# Cancellation attorney module - Phase 4 operational document generator

Phase 4 closes the fourth Phase 0 blocker: `cancellation_operational_generator_missing`.

It adds the first controlled document generator for the cancellation attorney lane. It generates only low-risk operational drafts from approved firm wording, using the Phase 2 canonical data contract and the Phase 3 Cancellation Pack Workspace controls.

The executable source is `src/core/transactions/cancellationAttorneyModulePhase4.js`.

## What changed

- Added a generator for the nine Phase 0 documents marked `generate_now`:
  - cancellation instruction acknowledgement and matter-opening note
  - seller existing-bond information request
  - cancellation figures request cover
  - 90-day notice and penalty-risk summary
  - cancellation guarantee request cover and schedule
  - guarantee acceptance or variance note
  - cancellation lodgement readiness checklist
  - cancellation registration notification
  - settlement and close-out report
- Added approved operational template records with:
  - template version id
  - template fingerprint
  - approval status
  - wording lock
  - approver identity and role
  - approval timestamp
- Added firm-branding inputs for generated render models.
- Added artifact-link metadata that binds each generated draft to:
  - workspace id
  - transaction id
  - document key
  - version id
  - content hash
  - canonical data fingerprint
- Added generated draft output with the Phase 3 watermark:
  `DRAFT - CANCELLATION ATTORNEY REVIEW REQUIRED`.
- Added redacted audit events for operational generation. Audit events include identifiers and version metadata, but exclude document body content and fact values.

## Generator boundary

Phase 4 is deliberately narrow. It may create review-required operational drafts only.

It does not:

- create final documents
- create signing packets
- dispatch documents externally
- submit anything to a lender or bank portal
- generate bank cancellation forms
- generate seller cancellation consent
- generate legal discharge or cancellation instruments
- generate company, trust or authority resolutions
- originate lender instructions
- issue or accept cancellation figures
- synthesize or accept guarantees
- create or alter Deeds Office evidence
- mark lodgement or registration
- reconcile or execute settlement

The generator blocks all non-operational Phase 0 documents, including:

- bank cancellation documents
- seller cancellation consent
- bond discharge or cancellation instrument
- seller authority resolution for cancellation
- lender cancellation instruction
- existing bond statement
- cancellation figures
- guarantee letter
- cancellation registration evidence
- proof of settlement

## Controls

Phase 4 enforces these controls in code:

- Only authorised operational users may generate drafts:
  `cancellation_attorney`, `conveyancer`, `secretary`, `firm_manager` or `system`.
- Canonical Phase 2 facts must be complete and verified.
- The Phase 3 Cancellation Pack Workspace must be valid.
- The pack item must be marked `generate_now` and ready for the Phase 4 generator.
- The template must be approved or published.
- The template wording must be locked.
- The template fingerprint must match the approved wording.
- Every draft remains review-required.
- Finalisation, signing, dispatch, lender submission, bank portal submission, Deeds submission, registration marking and settlement execution flags remain false.
- Each generated draft receives immutable version metadata through the Phase 3 versioning helper.

## Why this helps the cancellation attorney

The cancellation team can now create the routine admin pack without retyping matter facts or hunting across the file. The attorney still reviews the result, but the system handles the mechanical work:

- pulling verified lender, bond account, notice, figures, guarantee, signing, registration and settlement facts
- applying approved firm wording
- adding firm branding
- linking every artifact back to the workspace and canonical data fingerprint
- preventing accidental generation of bank forms, legal instruments, external evidence or settlement actions

That makes the conveyancer and secretary workflow useful without pretending Bridge can make lender, guarantee, Deeds Office or settlement decisions.

## Acceptance check

Run:

```bash
npm run test:cancellation-attorney-module-phase4
```

Phase 4 is complete when Phases 0-3 still pass, all nine operational drafts can be generated from approved templates, non-operational documents remain blocked, missing canonical facts block generation, unauthorised actors are rejected, settlement and registration actions remain disabled, and audit events stay redacted.
