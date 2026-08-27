# Buyer portal Phase 4: canonical documents

Phase 4 gives the production buyer portal and buyer demo one document presentation model, overview summary, and full document workspace. Production document state and actions remain authoritative.

## Data boundary

- Production continues to normalize live `workspaceData.documentCenter` records through `buildDocumentCentreSections()` and `buildBuyerMobileDocumentItems()`.
- `buildBuyerDocumentPresentationModel()` converts those items into the presentation vocabulary used by every desktop buyer document surface.
- The demo converts `BUYER_DOCUMENTS` fixtures into the same model. Its upload simulation only changes demo state.
- The shared model and UI do not import production services, Supabase, browser storage, or demo fixtures.

## Canonical status vocabulary

- `action`: missing, required, requested, rejected, or otherwise blocking the buyer.
- `review`: uploaded, received, or being reviewed.
- `approved`: approved, completed, verified, signed, or available.
- `upcoming`: not requested or available yet.

The model owns totals, completion and collection percentages, the first action item, and category membership for Sales, FICA, Finance, Property, and Additional Requests.

## Shared surfaces

- Production overview document card.
- Production buyer Documents page.
- Demo overview document card.
- Demo buyer Documents page.

The production workspace keeps `handleDocumentCentreUpload` and `handleOpenPortalDocument` as its action adapters. Seller documents retain `ClientDocumentCentre`; mobile document trees are unchanged in this phase.

## Verification

```bash
node src/core/clientPortal/__tests__/buyerDocumentPresentationModel.test.js
node scripts/buyer-portal-phase4-canonical-documents.test.mjs
node scripts/buyer-portal-phase0-stability.test.mjs
node scripts/buyer-portal-phase1-shared-shell.test.mjs
node scripts/buyer-portal-phase2-shared-overview.test.mjs
node scripts/buyer-portal-phase3-canonical-journey.test.mjs
npm run build
```
