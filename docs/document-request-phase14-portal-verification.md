# Document Request Phase 14: Portal Verification

Date: 2026-08-02

## Scope

Phase 14 verified the Phase 13 pilot rows through the client portal document-centre read model.

The verification is read-only. It does not commit rows, create `document_requests`, send notifications, or print raw portal tokens.

## Implemented

- Added `the-it-guy/scripts/document-request-canonical-phase14-portal-verification.mjs`.
- Added `the-it-guy/scripts/document-request-canonical-phase14-portal-verification-contract.test.mjs`.
- Fixed canonical portal signal handling so boolean `false` no longer counts as seller evidence.
- Preserved canonical document request identity fields on document-centre items, not only on required-document rows.
- Extended the existing Phase 5 portal test to cover buyer-only seller-overlay suppression and item-level canonical identity.

## Verification Result

Report: `the-it-guy/output/document-request-phase14-portal-verification.json`

- Transactions checked: 3
- Completed: 3
- Failed: 0
- Required-document rows checked: 40
- Expected portal-visible rows checked: 40
- Missing committed keys from shared portal model: 0
- `document_requests` created: false
- Non-canonical existing keys: 1 (`bond_grant`)
- Warnings: 2

## Warnings

Two pilot transactions do not currently have active portal access rows:

- `4b057a60-ff57-4ebb-82ac-77a4df4eff6c`
- `26f10c15-99f8-463a-8085-ee0ee9e830db`

That means the model verifies correctly, but those two cannot yet be browser-verified through a live portal link without creating or activating portal access.

The remaining non-canonical key is still `bond_grant` on `4b057a60-ff57-4ebb-82ac-77a4df4eff6c`. It was deliberately left untouched.

## Outcome

The Phase 13 committed rows are covered by the portal document-centre model. The active seller portal pilot carries the committed seller documents, including:

- `seller_tax_number`
- `seller_bank_account_confirmation`
- `seller_fica_pack`
- `seller_id_document`
- `seller_proof_of_address`

## Verification Commands

- `node scripts/client-portal-canonical-document-request-phase5.test.mjs`
- `node --check scripts/document-request-canonical-phase14-portal-verification.mjs`
- `node scripts/document-request-canonical-phase14-portal-verification-contract.test.mjs`
- `node scripts/document-request-canonical-phase14-portal-verification.mjs --use-default-pilot --output=output/document-request-phase14-portal-verification.json`
