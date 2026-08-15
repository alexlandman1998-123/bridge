# Bond Application Prefill Phase 15: Originator Review Workspace UX

## Purpose

Phase 15 improves the originator-side review experience.

Previous phases surfaced field alignment and buyer confirmation confidence separately. Phase 15 turns those signals into an originator review workspace that answers the operational question: what can the originator trust, what was system-prefilled, and what still needs action before bank submission?

## Runtime Contract

`buildBondApplicationViewModel()` now exposes `originatorReviewWorkspace`.

The workspace includes:

- `version: phase-15-v1`
- `score`
- `scoreLabel`
- `recommendedAction`
- `buyerConfirmedSections`
- `systemPrefilledSections`
- `missingOriginatorFields`
- `unconfirmedBuyerSections`
- `outstandingReadinessItems`
- `documentBlockers`
- `missingOriginatorActions`
- `sourceBuckets`
- `handoffWarnings`

The score combines:

- buyer application readiness
- buyer portal field alignment
- buyer section confirmation confidence

## Originator Workspace

`AttorneyTransactionDetail.jsx` renders a new `Originator Review Workspace` card with:

- review score
- recommended action
- buyer-confirmed count
- system-prefilled/originator-aligned count
- missing data count
- concise originator action list

The card uses these stable markers:

- `data-bond-originator-review-workspace="phase-15"`
- `data-bond-originator-action-list="true"`

## Handoff PDF

`buildBondApplicationPdfHtml()` now includes:

- `Originator Review Workspace`
- `Originator Action List`

This keeps the PDF aligned with the workspace view and separates buyer-confirmed, system-prefilled, and missing data before originator handoff.

## Boundary

Phase 15 is a review UX and handoff projection. It does not mutate buyer data, bank payloads, originator routing, or submission behaviour.
