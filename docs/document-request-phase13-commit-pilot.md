# Document Request Phase 13: Commit Pilot

Date: 2026-08-02

## Scope

Phase 13 committed the canonical document request projection for a controlled three-transaction pilot only.

The pilot wrote to `transaction_required_documents` through the canonical sync service. It did not create or update client-facing `document_requests` rows, so no request emails or portal-request sends were triggered by this phase.

## Pilot Transactions

- `4b057a60-ff57-4ebb-82ac-77a4df4eff6c`
- `9fdb69f0-5fe2-475d-8615-a254aa4440e6`
- `26f10c15-99f8-463a-8085-ee0ee9e830db`

## Result

Commit report: `the-it-guy/output/document-request-phase13-commit-pilot.json`

- Total transactions: 3
- Completed: 3
- Failed: 0
- Skipped: 0
- Canonical rows calculated: 39
- Canonical rows synced: 39
- Required-document row delta: 39
- `document_requests` delta: 0
- Client-facing document requests created: false
- Preserved uploaded/review rows changed: 0

Post-commit verification report: `the-it-guy/output/document-request-phase13-commit-pilot-postcheck.json`

- Total transactions: 3
- Completed: 3
- Failed: 0
- Required-document row delta after commit: 0
- `document_requests` delta after commit: 0
- Preserved uploaded/review rows changed after commit: 0

## Coverage Notes

The two buyer-and-seller pilot transactions now include the approved Phase 9 seller documents:

- `seller_tax_number`
- `seller_bank_account_confirmation`

The buyer-only pilot transaction now has the canonical buyer and finance rows. It also still has one pre-existing non-canonical row, `bond_grant`, which was deliberately left untouched by the pilot.

## Follow-Up Before Wider Commit

Before expanding beyond the pilot, decide how to handle legacy non-canonical keys like `bond_grant` so the UI does not show duplicate finance requirements where legacy rows already exist.

The Phase 13 script now reports `nonCanonicalExistingKeys` to make this visible during future pilots.

## Verification

- `node --check scripts/document-request-canonical-phase13-commit-pilot.mjs`
- `node scripts/document-request-canonical-phase13-commit-pilot-contract.test.mjs`
- `node scripts/document-request-canonical-phase8-api-contract.test.mjs`
- `node scripts/document-request-canonical-phase7-api-contract.test.mjs`
- `node src/services/documents/__tests__/documentRequestCanonicalRequiredDocumentSyncService.test.js`
- `node src/services/documents/__tests__/documentRequestCanonicalTransactionSyncService.test.js`
- `node src/services/documents/__tests__/documentRequestCanonicalAdminRecalculationService.test.js`
