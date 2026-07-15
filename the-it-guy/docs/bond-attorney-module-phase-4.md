# Bond attorney module - Phase 4 operational document generator

Phase 4 adds the first controlled document generator for the bond attorney lane. It generates only low-risk operational drafts from approved firm wording, using the Phase 2 canonical data contract and the Phase 3 Bond Pack Workspace controls.

The executable source is `src/core/transactions/bondAttorneyModulePhase4.js`.

## What changed

- Added a generator for the eight Phase 0 documents marked `generate_now`:
  - instruction acknowledgement / matter-opening acknowledgement
  - buyer FICA request pack and deficiency reminder wording
  - bank condition checklist / outstanding schedule
  - bond signing appointment letter and checklist
  - guarantee request cover and schedule
  - lodgement readiness checklist / cover sheet
  - registration notification
  - bank close-out report
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
  `DRAFT - ATTORNEY REVIEW REQUIRED`.
- Added redacted audit events for operational generation. Audit events include identifiers and version metadata, but exclude document body content and fact values.

## Generator boundary

Phase 4 is deliberately narrow. It may create review-required operational drafts only.

It does not:

- create final documents
- create signing packets
- dispatch documents externally
- submit anything to a bank
- generate legal instruments
- generate bank approvals
- create or alter Deeds Office evidence
- treat generated correspondence as proof of registration, lodgement or approval

The generator blocks all non-operational Phase 0 documents, including:

- bond instruction
- bank grant / approval
- mortgage bond draft
- power of attorney to mortgage
- bank mandate
- company / trust / entity resolutions
- signed bond pack
- bank confirmation / submission evidence

## Controls

Phase 4 enforces these controls in code:

- Only authorised operational users may generate drafts:
  `bond_attorney`, `secretary`, `firm_manager` or `system`.
- Canonical Phase 2 facts must be complete and verified.
- The Phase 3 Bond Pack Workspace must be valid.
- The pack item must be marked `generate_now` and ready for the Phase 4 generator.
- The template must be approved or published.
- The template wording must be locked.
- The template fingerprint must match the approved wording.
- Every draft remains review-required.
- Finalisation, signing, dispatch and bank submission flags remain false.
- Each generated draft receives immutable version metadata through the Phase 3 versioning helper.

## Why this helps the bond attorney

The bond team can now create the routine admin pack without retyping matter facts or hunting across the file. The attorney still reviews the result, but the system handles the mechanical work:

- pulling verified bank, buyer, property, signing, guarantee, lodgement and registration facts
- applying approved firm wording
- adding firm branding
- linking every artifact back to the workspace and canonical data fingerprint
- preventing accidental generation of sensitive legal instruments

That keeps the conveyancer/secretary workflow useful without pretending the system can make legal or bank decisions.

## Acceptance check

Run:

```bash
npm run test:bond-attorney-module-phase4
```

Phase 4 is complete when Phases 0-3 still pass, all eight operational drafts can be generated from approved templates, non-operational documents remain blocked, missing canonical facts block generation, unauthorised actors are rejected, and audit events stay redacted.
