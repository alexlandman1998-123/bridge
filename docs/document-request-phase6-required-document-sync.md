# Document Request Phase 6 Required Document Sync

Date: 2026-08-02

Status: implemented as an explicit persistence bridge for `transaction_required_documents`.

## Implemented

- Added `src/services/documents/documentRequestCanonicalRequiredDocumentSyncService.js`.
- Added a pure builder that converts canonical document request planner rows into `transaction_required_documents` rows.
- Added an explicit sync function that upserts those rows by `transaction_id,document_key`.
- Preserved existing uploaded/review status fields when a canonical row already exists.
- Kept pending-policy rows out of persistence by default.
- Added explicit options for pending-policy review:
  - `includePendingPolicyRows: true` writes them as inactive/not required.
  - `requestPendingPolicy: true` makes signed-off pending-policy rows active/missing.
- Added dry-run support so callers can preview the exact rows before writing.

## What This Does Not Do

This phase does not create `document_requests` rows and does not send client emails or notifications. It only syncs the durable required-document checklist table.

That keeps the legal matrix persistence separate from live request sending until attorney/policy signoff decides which pending-policy rows should become real requests.

## Verification

- `node --test src/services/documents/__tests__/documentRequestCanonicalRequiredDocumentSyncService.test.js`
- `node --test src/core/documents/__tests__/documentRequestCanonicalPlanner.test.js`
- `node --test src/core/documents/__tests__/documentRequestCanonicalAdapter.test.js`
- `node scripts/client-portal-canonical-document-request-phase5.test.mjs`
- `node scripts/client-portal-document-centre-phase4.test.mjs`
- `node scripts/client-portal-education-phase5.test.mjs`
- `node scripts/document-request-scenario-matrix.test.mjs`
- `node scripts/buyer-onboarding-south-african-scenarios.test.mjs`
- `node scripts/seller-onboarding-south-african-scenarios.test.mjs`
- `node scripts/verify-attorney-document-requirements.mjs`

## Remaining Boundary

The next phase can wire this explicit sync into a chosen transaction lifecycle event, such as attorney matter intake, buyer onboarding submission, seller onboarding completion, or an admin-only recalculation action.
