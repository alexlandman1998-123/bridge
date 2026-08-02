# Document Request Phase 9: Policy Decisions

Phase 9 records the policy decisions for seller-side documents that were previously held behind pending-policy signoff.

## Approved Decisions

- `seller_tax_number` is required automatically.
- `seller_bank_account_confirmation` is required automatically.
- Neither document is attorney-only/internal-first.
- Both remain client-visible seller requests.

## Implementation

The canonical checklist now marks:

- `seller_income_tax_number`: `approved`
- `seller_bank_confirmation`: `approved`

The requirement levels are now:

- `seller_tax_number`: `required`
- `seller_bank_account_confirmation`: `required`

These rows are included in normal seller/client recalculation without passing `requestPendingPolicy`.
