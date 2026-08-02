# Document Request Phase 4 Portal Verification

Date: 2026-08-02

Status: implemented as a non-breaking canonical request planner. Live request creation has not been switched over yet.

## Implemented

- Added `src/core/documents/documentRequestCanonicalPlanner.js`.
- Added role-specific request-plan generation from the canonical legal matrix.
- Added audience filtering for:
  - buyer
  - seller
  - attorney / transfer attorney / bond attorney
  - cancellation attorney
  - bond originator
  - internal/admin
- Added request-plan summaries by audience, requested-from role, level and blocker stage.
- Kept pending-policy rows visible for verification but not directly requestable by default.

## Planner Output

Each planned request exposes:

- `key`
- `canonicalDocumentRequestKey`
- `title`
- `ownerRole`
- `requestedFrom`
- `appliesTo`
- `level`
- `visibility`
- `blocker`
- `blocksStage`
- `clientVisible`
- `attorneyVisible`
- `portalAudience`
- `pendingPolicy`
- `requiresAttorneySignoff`
- `requestable`
- `matrixVersion`
- `sourceVersion`

## Coverage Rules

- Buyer view only receives client-visible rows requested from the buyer.
- Seller view only receives client-visible rows requested from the seller.
- Attorney views receive client-visible and professional-shared rows.
- Cancellation attorney receives cancellation rows and seller-existing-bond rows.
- Bond originator receives finance/bond rows only, such as bond approval, signed grant and affordability documents.
- Pending-policy requirements stay in the plan but have `requestable: false` and `blocksStage: null` unless `requestPendingPolicy: true` is passed.

## Verification Scenario

The test scenario combines:

- trust buyer
- company seller
- hybrid finance
- seller existing bond
- sectional title property
- gas installation

That scenario verifies buyer trust documents, seller company documents, cash and bond finance documents, existing-bond cancellation documents, sectional title documents and gas compliance documents all resolve into the same request plan before audience filtering.

## Verification Commands

- `node --test src/core/documents/__tests__/documentRequestCanonicalPlanner.test.js`
- `node --test src/core/documents/__tests__/documentRequestCanonicalAdapter.test.js`
- `node scripts/document-request-scenario-matrix.test.mjs`
- `node scripts/buyer-onboarding-south-african-scenarios.test.mjs`
- `node scripts/seller-onboarding-south-african-scenarios.test.mjs`
- `node scripts/verify-attorney-document-requirements.mjs`

## Remaining Boundary

Phase 4 now proves what should be requested and who should see it. The live portal/workspace request creation flow still needs a later integration step before the canonical planner becomes the production source for creating additional document request rows.
