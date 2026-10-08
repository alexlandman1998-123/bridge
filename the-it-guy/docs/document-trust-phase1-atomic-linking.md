# Document Trust Phase 1: Atomic Linking

Phase 1 prevents new seller portal uploads from succeeding as legacy-only records.

## Behaviour

- Buyer uploads continue to use their existing atomic canonical RPC and storage rollback.
- Seller uploads no longer fall back to a direct `private_listing_documents` insert when the seller upload RPC is unavailable or fails.
- If the seller database operation fails, the just-uploaded storage object is removed. Session failures reopen password entry; rejected links explain that the link needs checking. Other linking failures retain `seller_document_canonical_link_failed`.
- When a transaction exists, the seller upload RPC requires one shared `documents` row on that transaction with a canonical requirement instance. Any failure rolls the database operation back.
- Before a transaction exists, a seller file is returned as `pending_transaction_link`; it is not reported as a completed transaction document.

## Boundary

Legacy requirement and document rows remain read compatibility projections. Phase 1 does not delete or deactivate them; that is the active-transaction migration work in Phase 2.

Deploy the database migration before the browser change. The browser accepts only the explicit `canonically_linked` or `pending_transaction_link` result returned by the Phase 1 RPC.

## Stable seller portal upload correction

`20261008154013_seller_portal_upload_token_resolution.sql` corrects the upload
lookup used by Kingdom Real Estate and ISellProperty.co.za. The portal reader
accepts a permanent `seller_portal_token`, but the upload base retained a lookup
against the separate onboarding `token`, causing valid workspace uploads to fail
with “Seller portal link is invalid or inactive.” The browser wrapped this as the
document-linking error.

The correction uses the existing token resolver before calling the private upload
base and locks the resolved onboarding row when accepting a returned signing copy.
Permanent workspace links continue to work after onboarding expiry. Expired
onboarding links and one-time invitation links cannot upload. Link inactivity,
password/session checks, reviewed-copy versions and atomic transaction linking
remain enforced. The migration preserves records, tokens, function grants and the
private upload base; it stops on unexpected live function definitions.

The local regression suite reproduces the original failure, verifies uploads for
two separate agency fixtures and checks failed uploads leave no database changes.
Transaction promotion is synthetic infrastructure; hosted Storage and a real
seller upload still require verification after an explicitly approved database
release. No browser release is required for this correction.

The accompanying browser error-handling change distinguishes a rejected link
from a transaction-linking failure and preserves expired-session errors so the
existing portal password flow can run. That message change requires an app
release; the database correction alone fixes permanent-link uploads.

## Verification

```bash
npm run test:document-trust-phase1
```
