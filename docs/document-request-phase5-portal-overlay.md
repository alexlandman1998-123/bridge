# Document Request Phase 5 Portal Overlay

Date: 2026-08-02

Status: implemented as a live document-centre read-model overlay. Database request creation and notification sending remain on the existing additional document request flow.

## Implemented

- Wired the canonical document request planner into `src/services/clientPortalWorkspaceService.js`.
- Added canonical document-centre overlay generation for real transaction or explicit scenario payloads.
- Added buyer, seller and shared workspace audience mapping:
  - buying workspace uses buyer-visible canonical requests
  - selling workspace uses seller-visible canonical requests
  - shared workspace uses all client-visible buyer/seller requests
- Added de-duping against existing required-document rows using canonical request keys where present.
- Preserved existing upload matching, document-centre item building and summary calculation.
- Kept generic/demo document-centre payloads unchanged unless they carry a transaction or explicit canonical scenario signal.
- Guarded seller-side canonical rows so they are only overlaid when seller/scenario structure data is present.

## Behavior

The portal document centre can now show canonical missing documents from the legal matrix even when a matching legacy required-document row has not already been persisted.

Pending-policy rows are still visible in the canonical request plan, but they are mapped as not directly uploadable in the document centre unless a later phase enables policy-approved request creation.

Buyer-only transaction payloads do not fabricate seller-side requirements from the matrix defaults. Seller rows require seller entity/scenario evidence.

## Verification

- `node scripts/client-portal-canonical-document-request-phase5.test.mjs`
- `node scripts/client-portal-document-centre-phase4.test.mjs`
- `node scripts/client-portal-education-phase5.test.mjs`
- `node --test src/core/documents/__tests__/documentRequestCanonicalPlanner.test.js`
- `node --test src/core/documents/__tests__/documentRequestCanonicalAdapter.test.js`
- `node scripts/document-request-scenario-matrix.test.mjs`
- `node scripts/buyer-onboarding-south-african-scenarios.test.mjs`
- `node scripts/seller-onboarding-south-african-scenarios.test.mjs`
- `node scripts/verify-attorney-document-requirements.mjs`

## Remaining Boundary

The canonical planner is now visible in the portal read model. A later phase should decide whether canonical request-plan rows should create or sync `document_requests` / `transaction_required_documents` rows automatically, including pending-policy signoff rules.
