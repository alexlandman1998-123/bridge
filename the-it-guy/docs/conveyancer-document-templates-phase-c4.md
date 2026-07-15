# Conveyancer Document Templates — Phase C4

## Purpose

C4 assembles governed operational conveyancing documents after C1 template governance, C2 deterministic value resolution and C3 data rules. It produces an immutable, renderer-neutral draft model for the existing document-packet pipeline.

The executable service is `src/services/attorneyWorkflow/conveyancerOperationalDocumentGenerator.js`.

## Supported document families

C4 supports:

- Instructions.
- Applications.
- Declarations.
- Consents.
- Resolutions.
- Certificates.
- Checklists.
- Annexures.

Agreements and correspondence remain outside this generator. Correspondence stays in C2; agreements require their own execution-specific controls.

## Governed asset contract

An operational asset is bound to one C1 template version and contains:

- Output format: PDF, DOCX or HTML.
- Governed title and file-name templates.
- Ordered structured sections with required, page-break and keep-together settings.
- Optional signing-field definitions with controlled field types, signer roles, section bindings and variable references.
- An exact SHA-256 content hash matching the approved C1 template version.

The asset must use exactly the governed placeholder registry. Unknown placeholders, unused governed placeholders, duplicate sections, duplicate signing fields, unknown section/variable references and unsupported signing definitions block assembly.

## Assembly flow

1. Validate the active A-series matter plan and optimistic plan identity.
2. Enforce actor visibility and legal-lane authority.
3. Bind the draft to an existing non-terminal A-series matter action.
4. Select the applicable published C1 template without crossing organisations.
5. Stop on equal-priority routing conflicts.
6. Verify the structured asset hash and schema.
7. Resolve mapped, calculated, agency, signing-preset, manual and approved-clause values through the C2 resolver.
8. Apply reusable C3 semantic, cross-field, source-verification, freshness and conflict checks.
9. Stop when blocking data checks fail; retain warning-only results for mandatory review.
10. Interpolate the title, safe output filename and ordered sections.
11. Produce a deterministic render model, SHA-256 content and provenance fingerprints, and a redacted audit event.

## Output boundary

Every C4 document is a `draft` with:

- `renderReady: true` for a later packet-rendering adapter.
- `reviewRequired: true`.
- `persistAllowed: false`.
- `signingAllowed: false`.
- `dispatchAllowed: false`.

C4 does not call the existing renderer, generate a PDF or DOCX, save packet versions, create signing fields, send signature requests, deliver documents, modify matter actions or resolve exceptions.

## Privacy and idempotency

Resolved values appear only in the document content that needs them. Audit metadata contains hashes, counts, provenance and sensitive variable keys without document text or sensitive values. Source conflicts never copy competing values into the result.

Command IDs provide authorised idempotent replay and reject reuse for another operational document. Inputs are never mutated.

## Database impact

C4 deliberately hands a renderer-ready in-memory model to the existing packet infrastructure. It adds no parallel document store and requires no database migration.
