# Document Trust Phase 1: Atomic Linking

Phase 1 prevents new seller portal uploads from succeeding as legacy-only records.

## Behaviour

- Buyer uploads continue to use their existing atomic canonical RPC and storage rollback.
- Seller uploads no longer fall back to a direct `private_listing_documents` insert when the seller upload RPC is unavailable or fails.
- If the seller database operation fails, the just-uploaded storage object is removed and the portal receives the stable `seller_document_canonical_link_failed` error.
- When a transaction exists, the seller upload RPC requires one shared `documents` row on that transaction with a canonical requirement instance. Any failure rolls the database operation back.
- Before a transaction exists, a seller file is returned as `pending_transaction_link`; it is not reported as a completed transaction document.

## Boundary

Legacy requirement and document rows remain read compatibility projections. Phase 1 does not delete or deactivate them; that is the active-transaction migration work in Phase 2.

Deploy the database migration before the browser change. The browser accepts only the explicit `canonically_linked` or `pending_transaction_link` result returned by the Phase 1 RPC.

## Verification

```bash
npm run test:document-trust-phase1
```
