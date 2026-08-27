# Document Request Phase 9: Upload Linking

Phase 9 closes the loop between a visible request container and the eventual upload action.

## Scope

- Buyer/client portal uploads keep using `uploadClientPortalDocument` and `updateDocumentRequestFromUploadIfPossible`.
- Seller portal uploads now accept `documentRequestId` and call `linkSellerPortalDocumentRequestUpload` after the document upload succeeds.
- Container-backed portal cards pass `uploadSpec.requestId` into the upload action for both buyer and seller workspaces.
- Open request rows in the agent transaction document library expose an explicit **Upload on behalf** action.
- Agent uploads retain the exact `documentRequestId`, the represented buyer or seller, and the `professional_request_upload_on_behalf` audit source.
- The `document_requests` row is updated with `requested_document_id`, `status`, `completed_at`, `rejected_reason`, and `updated_at` where the schema supports those fields.

## Runtime Rule

`documentRequestId` is the primary match when it is available. Transaction/category matching remains a compatibility path on the buyer upload service, but seller portal uploads should not guess when a precise request container id exists.

Schema-compatibility retries must preserve the transaction scope and exact request ID. They may use a reduced select list for older schemas, but may not broaden an exact request upload into a transaction-wide guess.

## Client-supplied and agent-supplied files

The same request can be satisfied in either supported way:

1. The buyer or seller uploads through their client portal.
2. The client emails the file to the agent, and the agent selects **Upload on behalf** from the request row.

The second path stores the authenticated professional as the uploader while `uploaded_by_party` records the client party represented. The request-link event also records `uploadedByParty` and `uploadedOnBehalf` for auditability.

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

The gate is read-only and checks buyer upload linking, seller upload linking, agent upload-on-behalf attribution, exact request-id preservation, portal request-id propagation, and the container upload transition.
