# Document Request Phase 3 Engine Alignment

Date: 2026-08-02

Status: implemented as compatibility alignment. Existing public document keys remain unchanged; buyer, seller and attorney outputs now carry canonical request metadata.

## Implemented

- Added `src/core/documents/documentRequestCanonicalAdapter.js`.
- Restored the canonical checklist JSON and matrix wrapper required by the adapter.
- Added canonical metadata to buyer requirement output.
- Added canonical metadata to seller requirement output.
- Added canonical metadata to attorney fallback requirements.
- Added pending-policy buyer beneficial-ownership prompts for company and trust purchasers.
- Preserved legacy keys so existing UI, uploads and tests do not break.

## Canonical Metadata Added

Each aligned requirement can now expose:

- `canonicalDocumentRequestKey`
- `canonicalDocumentRequestKnown`
- `canonicalDocumentRequestLevel`
- `canonicalDocumentRequestVisibility`
- `canonicalDocumentRequestBlocker`
- `canonicalDocumentRequestOwnerRole`
- `documentRequestCanonicalAdapterVersion`

## Important Behavior Notes

- Pending-policy items are identified but not converted into hard blockers in this phase.
- Seller company/trust beneficial ownership remains present as existing internal optional rows, but now maps to canonical pending-policy requirements.
- Buyer company/trust beneficial ownership is now present in buyer requirement profiles as `pending_policy_required`.
- Actual request creation still uses existing flows. Switching generation to the canonical matrix belongs to Phase 4/next implementation step.

## Verification

- `node --test src/core/documents/__tests__/documentRequestCanonicalAdapter.test.js`
- Existing scenario tests should continue to pass because legacy keys are preserved.

