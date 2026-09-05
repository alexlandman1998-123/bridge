# Document trust — Phase 3 role-scoped projections

Phase 3 makes the data room a role projection of canonical requirements, rather than a client-side reconciliation of multiple document lists.

## Implemented contract

- A document satisfies a requirement only through an exact canonical link: `documents.canonical_requirement_instance_id = document_requirement_instances.id`, or the requirement's explicit `satisfied_by_document_id`.
- Type, category, filename, and pack matches are no longer allowed to turn a pending requirement into an uploaded or completed requirement.
- `client` visibility is limited to the buyer or seller explicitly responsible for that requirement. It is not a shared buyer-and-seller audience.
- A linked client document is openable only when it is both client-visible and outside an `internal` or `private` visibility scope.
- The buyer portal uses `bridge_client_portal_canonical_document_projection()`. It derives the transaction solely from the validated portal token and returns only buyer-visible requirements plus client-visible, exactly linked documents.

## Security boundary

The browser projection is a presentation guard, not a replacement for storage access control. The Phase 3 RPC does not accept a caller-selected transaction or role, and it exposes only the document descriptors required by the existing portal open flow. Storage object policies and signed-url generation must continue to enforce the same transaction and recipient scope.

## Deployment and verification

Apply the Phase 3 migration before enabling the buyer canonical workspace. Then run:

```sh
npm run test:document-trust-phase3
npx vitest run src/services/documents/__tests__/canonicalDocumentWorkspaceService.test.js src/services/documents/__tests__/canonicalDocumentRoleProjectionService.test.js
```

In staging, verify with a buyer portal token that a buyer requirement appears, a seller-only requirement does not appear, and an unlinked or internal document cannot show as completed or be opened. Phase 4 is still responsible for retiring remaining legacy readers.
