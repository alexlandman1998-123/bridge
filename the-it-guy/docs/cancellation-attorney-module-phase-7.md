# Cancellation attorney module - Phase 7 document signing workspace

Phase 7 closes the seventh controlled blocker: `cancellation_document_signing_workspace_missing`.

It creates a governed document/signing readiness workspace for cancellation attorneys. The workspace binds cancellation documents to approved templates, checks required fact variables, verifies document and signature evidence, and only unlocks Phase 8 when the guarantee workspace is ready and every template-controlled cancellation document is lodgement-ready.

The executable source is `src/core/transactions/cancellationAttorneyModulePhase7.js`.

## What changed

- Added a document/signing workspace for the cancellation attorney lane.
- Added governed template bindings for Phase 0 template-controlled documents:
  - bank cancellation documents
  - cancellation consent
  - bond discharge or cancellation instrument
  - seller authority/resolution for cancellation
- Added template validation for:
  - exact template document key
  - approved or published lifecycle status
  - locked wording
  - valid template content hash
  - required variable mappings
  - firm approval where required
  - bank approval where required
  - publication dates and authorised publisher
  - generic fallback prohibition
- Added a guarantee gate, requiring Phase 6 to be valid and ready before document signing can unlock the next phase.
- Added document evidence contracts for:
  - governed template binding
  - prepared bank cancellation document evidence
  - seller signature evidence
  - original signed document evidence
  - seller authority evidence or waiver
- Added a checklist model that gives conveyancers and cancellation secretaries a direct row-by-row work queue.
- Added redacted audit metadata. Audit events include fingerprints, statuses, metrics and template binding references, not document bodies, evidence payloads, fact values, clauses or render models.

## Document states

Phase 7 supports these document item statuses:

- `blocked`
- `template_ready`
- `awaiting_signature`
- `partially_signed`
- `ready`
- `waived`

The workspace supports these overall states:

- `blocked`
- `prepared`
- `partially_signed`
- `ready_for_lodgement`

That split matters because a document can have a valid governed template but still be waiting for signature evidence, original document evidence, or seller authority evidence.

## Controls

Phase 7 enforces these controls in code:

- Phase 6 guarantee workspace must be ready.
- Seller cancellation signing facts must be verified.
- Signed cancellation document status must be verified.
- Every template-controlled document must use a governed template.
- Firm-approved documents require firm approval.
- Bank-approved documents require bank approval.
- Required template variables must cover canonical Phase 2 fact keys.
- Generic fallback templates are forbidden.
- Signature and original-document gaps are visible as warnings and next actions.
- Rejected evidence blocks readiness.
- Legal instrument generation, signing-provider envelope creation, live signature capture, deeds-office lodgement, external writes and matter mutation are all explicitly disabled.

## Phase 7 boundary

This phase intentionally does not:

- render legal instruments
- generate final cancellation documents
- create signing-provider envelopes
- capture live signatures
- submit anything to a bank portal
- lodge at the deeds office
- mark registration
- write to external systems
- mutate the matter

It is a structured document/signing readiness workspace only.

## Why this helps the cancellation attorney

The cancellation team can now answer the practical question: “Are the governed cancellation documents and signatures ready for lodgement?” without manually stitching together template approvals, seller signing requirements, original-document evidence and guarantee readiness.

The workspace shows:

- whether the guarantee gate is clear
- which governed template version is bound to each cancellation document
- whether firm and bank approvals are in place
- whether required canonical facts are verified
- whether signature or original-document evidence is missing
- whether any authority evidence has been waived with a reason
- what the next action is for each document row

That gives the conveyancer a clean operational checklist before Phase 8 can deal with lodgement readiness.

## Acceptance check

Run:

```bash
npm run test:cancellation-attorney-module-phase7
```

Phase 7 is complete when Phases 0-6 still pass, governed templates validate, missing approvals block readiness, signature gaps produce next actions, the guarantee gate blocks document readiness when unsafe, audit metadata stays redacted, no instruments/signing packets are generated, and only a fully evidenced document workspace unlocks Phase 8 readiness.
