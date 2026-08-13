# Document Request Phase 8: Client Portal Container Adoption

## Purpose

Phase 8 moves the client portal additional-document tab onto the shared request container model.

Phase 7 proved that `buildDocumentCenter` returns the correct `documentRequestContainers`. Phase 8 makes the page prefer those containers when rendering active additional document requests.

## Behaviour

The client portal now:

- reads `workspaceData.documentCenter.documentRequestContainers`;
- derives additional request cards from containers with `source === 'document_requests'`;
- uses `uploadSpec.requestId` when uploading against a request container;
- keeps the older `additionalDocumentRequests` rendering as a compatibility fallback for stale payloads.

## Why The Fallback Remains

Some environments may still return payloads that do not include `documentRequestContainers`. The fallback prevents older portals from showing an empty additional-request tab during rollout.

## Verification

Run:

```sh
npm run verify:document-request-phase8-client-portal-container-adoption
```

The generated report is written to:

```text
output/document-request-phase8-client-portal-container-adoption.json
```
