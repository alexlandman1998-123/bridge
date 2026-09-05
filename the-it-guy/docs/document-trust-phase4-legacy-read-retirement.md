# Document trust — Phase 4 legacy-read retirement

Phase 4 switches the buyer portal’s core document room to the Phase 3 token-scoped canonical projection. It does not delete legacy records.

## Release gate

Set `VITE_DOCUMENT_TRUST_PHASE4_ENABLED=true` only after the Phase 3 migration is applied and staging verification has passed. When enabled, buyer document requirements and linked files are built exclusively from `bridge_client_portal_canonical_document_projection()`.

If that projection is unavailable, the document room fails closed: it shows an unavailable state and does not reconstruct requirements from `transaction_required_documents`, loose portal documents, key matching, filenames, or categories.

## Kept deliberately out of this cutover

- Seller portal document reads remain on their separately authenticated listing workflow. They require their own token-scoped canonical projection before the same fence can be enabled there.
- `document_requests` remains the bounded additional-request workflow. It is not used to decide whether a core canonical requirement is satisfied.
- No legacy rows, storage objects, or audit events are deleted.

## Verification

```sh
npm run test:document-trust-phase4
npx vitest run src/services/__tests__/clientPortalWorkspacePhase4DocumentTrust.test.js
```

In staging with the flag enabled, test a buyer token with one exact linked document and one similarly named but unlinked document. Only the exact link may change the requirement state. Disable the Phase 3 RPC in a controlled test: the buyer document room must show unavailable rather than a legacy fallback.
