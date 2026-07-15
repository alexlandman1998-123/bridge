# Cancellation attorney module - Phase 3 Cancellation Pack Workspace foundation

Phase 3 closes the third Phase 0 blocker: `cancellation_pack_workspace_missing`.

It adds the Cancellation Pack Workspace foundation on top of the Phase 1 usability model and Phase 2 canonical data contract. It does not render documents, persist workspace rows, send signing links, lodge anything, mark registration, reconcile settlement, execute payments or integrate with lender, Deeds Office or bank systems.

The executable source is `src/core/transactions/cancellationAttorneyModulePhase3.js`. The cancellation command centre now carries the Phase 3 workspace payload through `src/core/transactions/attorneyCancellationWorldClassCockpit.js`.

## What changed

- Added a Cancellation Pack Workspace model on top of the Phase 2 canonical facts.
- Pulled Phase 1 document requirements into the workspace so the conveyancer sees facts, requirements, evidence state and review state together.
- Added the workspace lifecycle:
  `not_started -> missing_info -> ready_to_prepare -> draft_prepared -> attorney_review -> approved -> sent_for_signature -> partially_signed -> fully_signed -> lodgement_ready -> lodged -> registered -> settlement_proof_received -> closed`, with `superseded` and `withdrawn` exits.
- Added 19 pack items from the Phase 0 document automation boundary.
- Each pack item declares required canonical facts, readiness, document status, review state, evidence state and generation state.
- Added immutable version metadata for future generated drafts.
- Added required template-version binding, content hash, fact fingerprints and data fingerprint.
- Added draft watermark enforcement: `DRAFT - CANCELLATION ATTORNEY REVIEW REQUIRED`.
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
- Bank/lender outcomes remain source-evidence only.
- Settlement execution remains external and manual.
- Registration cannot be inferred from workflow stage text alone.
- The workspace does not mutate the matter.

## Phase 3 boundary

This phase intentionally does not:

- generate operational cancellation correspondence
- generate bank cancellation forms
- generate legal instruments
- create or update database records
- send signing packets
- submit to a lender or bank portal
- lodge or register anything
- mark registration without evidence
- reconcile or execute settlement
- close the matter automatically

Phase 4 can now plug operational drafting into this workspace without inventing lifecycle, versioning, fact binding or audit semantics.

## Acceptance check

Run:

```bash
npm run test:cancellation-attorney-module-phase3
```

Phase 3 is complete when Phases 0, 1 and 2 still pass, the workspace lifecycle is enforced, all 19 cancellation pack items are represented, document requirements and canonical facts are visible together, draft versions are bound to canonical facts, silent regeneration is blocked, changed facts invalidate drafts, the cancellation cockpit carries the Phase 3 payload, and audit events remain redacted.
