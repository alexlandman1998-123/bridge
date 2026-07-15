# Bond attorney module - Phase 3 Bond Pack Workspace foundation

Phase 3 adds the Bond Pack Workspace foundation. It does not render documents, persist workspace rows, send signing links, submit to banks or integrate with Deeds Office systems.

The executable source is `src/core/transactions/bondAttorneyModulePhase3.js`.

## What changed

- Added a Bond Pack Workspace model on top of the Phase 2 canonical data contract.
- Added the workspace lifecycle:
  `not_started -> missing_info -> ready_to_draft -> draft_generated -> attorney_review -> approved -> sent_for_signature -> partially_signed -> fully_signed -> bank_submitted -> bank_accepted`, with `superseded` and `withdrawn` terminal exits.
- Added 16 pack items from the Phase 0 document automation boundary.
- Each pack item declares required canonical facts, readiness, generation state and evidence requirements.
- Added immutable version metadata for generated drafts.
- Added required template-version binding, content hash, fact fingerprints and data fingerprint.
- Added draft watermark enforcement: `DRAFT - ATTORNEY REVIEW REQUIRED`.
- Added no-silent-regeneration control through a required generation command id.
- Added redacted audit-event generation that excludes fact values and document content.
- Added regeneration detection when Phase 2 canonical facts change after a draft is bound.

## Workspace controls

Phase 3 enforces these controls in code:

- Immutable versions.
- Template version required.
- Fact fingerprint required.
- No silent regeneration.
- Draft watermark required.
- Audit trail required.

## Phase 3 boundary

This phase intentionally does not:

- Generate operational correspondence.
- Generate legal instruments.
- Create or update database records.
- Create signing packets.
- Submit to a bank portal.
- Treat bank approval or Deeds Office registration as system-generated.

Phase 4 can now plug operational drafting into this workspace without inventing lifecycle, versioning or audit semantics.

## Acceptance check

Run:

```bash
npm run test:bond-attorney-module-phase3
```

Phase 3 is complete when Phase 0, Phase 1 and Phase 2 still pass, the workspace lifecycle is enforced, draft versions are bound to canonical facts, silent regeneration is blocked, changed facts invalidate drafts, and audit events remain redacted.
