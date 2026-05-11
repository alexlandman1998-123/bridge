# Legal Document Signing Method Notes

## Scope

Added explicit Mandate Agreement signing method selection inside the Legal Document Workspace. The implementation keeps the existing digital signing flow intact and adds a physical / printed mandate workflow for download, offline signing, upload, and finalization.

## Files Changed

- `src/components/documents/LegalDocumentWorkspace.jsx`
- `src/lib/documentPacketsApi.js`
- `legal-document-signing-method-notes.md`

## Signing Method State Model

- Method is stored on `document_packets.source_context_json`:
  - `signing_method: digital`
  - `signing_method: physical`
  - missing/unknown values resolve as `not_selected`
- The method is additive metadata only. No schema changes were introduced.

## Digital Flow Behavior

- Digital Mandate keeps the existing signer workflow:
  - signer preparation
  - signer detail validation
  - secure signing link generation
  - signer progress tracking
  - final signed document generation
- `Send for Signature` is blocked unless Digital Mandate is selected.
- A `digital_signature_sent` audit event is added when the first digital send is triggered.

## Physical Flow Behavior

- Physical / Printed Mandate shows a dedicated manual signing panel:
  - Download PDF
  - Upload Signed Mandate
  - optional notes
  - all-parties-signed checkbox
  - required confirmation checkbox
- The uploaded document is stored as the packet version final signed artifact.
- If a transaction id is available, the upload is also inserted into transaction documents as:
  - category: `Signed Mandate`
  - document type: `signed_mandate_manual_upload`
  - filename: `Signed Mandate - Manual Upload.<ext>`
- The packet is finalized as `completed` and resolves to signed through the existing packet status resolver.

## Method Change Rules

- Method can be changed while the mandate is:
  - Draft
  - In Review
  - Approved
  - Locked
- Method changes are blocked after:
  - digital signing has been sent
  - any digital signer has viewed/signed/declined/expired
  - a manual signed mandate has been uploaded
  - a final signed artifact exists
- Blocked changes show a clear user-facing reason.

## Audit Events

Added/used the following events:

- `signing_method_selected`
- `signing_method_changed`
- `physical_mandate_downloaded`
- `manual_signed_document_uploaded`
- `digital_signature_sent`

Events include packet/version context, transaction id where available, and selected method. Actor and timestamp are handled by the existing packet event insert path.

## Document Integration

- Manual uploads use the transaction document upload flow when the packet has a transaction id.
- Lead-only mandate routes without a transaction id still store the final signed artifact on the packet version, but cannot create a transaction document row until a transaction exists.
- Digital final signed documents continue to use the existing final signed document generation path.

## Known Limitations

- The physical download button requires an existing generated PDF/preview URL. Live iframe-only previews are not exported to PDF by this pass.
- Manual upload does not mark digital signers as signed and remains clearly distinct through `finalSignedSource: manual_upload`.
- No destructive schema changes were made.

## Build / Lint Result

- Targeted lint passed:
  - `npx eslint src/components/documents/LegalDocumentWorkspace.jsx src/lib/documentPacketsApi.js`
- Production build passed:
  - `npm run build`
- Existing build warnings remain:
  - CSS minify warning near generated CSS token `-: TZ.;`
  - large bundle/chunk warning.
