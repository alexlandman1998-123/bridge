# Document Request Phase 7 Controlled Activation

Date: 2026-08-02

Status: implemented as an explicit transaction-level sync entry point.

## Implemented

- Added `src/services/documents/documentRequestCanonicalTransactionSyncService.js`.
- Reused the attorney workflow transaction facts resolver to derive canonical request scenarios from live transaction context.
- Added auto audience selection:
  - buyer + seller facts known -> `client`
  - buyer facts only -> `buyer`
  - seller facts only -> `seller`
  - neither known -> skipped as `insufficient_transaction_facts`
- Added a guard so seller-side checklist rows are not persisted from default assumptions when seller structure is unknown.
- Added `syncTransactionCanonicalDocumentRequestRequirements(transactionId, options)` in `src/lib/api.js`.
- Added dry-run support through the API wrapper.
- Added transaction event logging for non-dry-run sync attempts.

## Activation Boundary

Phase 7 gives the product a safe callable activation point. It does not automatically run on every transaction update yet, and it still does not create `document_requests` rows or send request emails.

This is intentional: the sync writes durable checklist rows only. Email/request creation should remain a separate policy-approved step.

## Verification

- `node --test src/services/documents/__tests__/documentRequestCanonicalTransactionSyncService.test.js`
- `node --test src/services/documents/__tests__/documentRequestCanonicalRequiredDocumentSyncService.test.js`
- `node scripts/document-request-canonical-phase7-api-contract.test.mjs`
- API wrapper esbuild bundle check
- `node --test src/core/documents/__tests__/documentRequestCanonicalPlanner.test.js`
- `node --test src/core/documents/__tests__/documentRequestCanonicalAdapter.test.js`
- `node scripts/client-portal-canonical-document-request-phase5.test.mjs`
- `node scripts/document-request-scenario-matrix.test.mjs`
- `node scripts/buyer-onboarding-south-african-scenarios.test.mjs`
- `node scripts/seller-onboarding-south-african-scenarios.test.mjs`
- `node scripts/verify-attorney-document-requirements.mjs`

## Remaining Boundary

The next phase can choose where to call the activation point automatically, such as attorney matter intake, buyer onboarding submission, seller onboarding completion, or an admin-only recalculation control in the UI.
