# Document Request Phase 9: Upload Linking

Phase 9 closes the loop between a visible request container and the eventual upload action.

## Scope

- Buyer/client portal uploads keep using `uploadClientPortalDocument` and `updateDocumentRequestFromUploadIfPossible`.
- Seller portal uploads now accept `documentRequestId` and call `linkSellerPortalDocumentRequestUpload` after the document upload succeeds.
- Container-backed portal cards pass `uploadSpec.requestId` into the upload action for both buyer and seller workspaces.
- The `document_requests` row is updated with `requested_document_id`, `status`, `completed_at`, `rejected_reason`, and `updated_at` where the schema supports those fields.

## Runtime Rule

`documentRequestId` is the primary match when it is available. Transaction/category matching remains a compatibility path on the buyer upload service, but seller portal uploads should not guess when a precise request container id exists.

For seller portal uploads, the promoted transaction document id is preferred:

1. `promotedSharedDocument.id`
2. `documentRow.promoted_document_id`
3. `documentRow.id`

This keeps the request container aligned with the shared transaction document whenever the seller upload was promoted from the private listing workspace.

## Gate

Run:

```sh
npm run verify:document-request-phase9-upload-linking
```

The report is written to:

```text
output/document-request-phase9-upload-linking.json
```

The gate is read-only and checks that buyer upload linking, seller upload linking, portal request-id propagation, and the container upload transition remain aligned.
