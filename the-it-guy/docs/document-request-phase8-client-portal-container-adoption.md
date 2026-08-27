# Document Request Phase 8: Client Portal Container Adoption

## Purpose

Phase 8 moves the client portal additional-document tab onto the shared request container model.

Phase 7 proved that `buildDocumentCenter` returns the correct `documentRequestContainers`. Phase 8 makes every active client document workspace prefer those containers when rendering additional document requests.

## Behaviour

The client portal now:

- reads `workspaceData.documentCenter.documentRequestContainers`;
- derives additional request cards from containers with `source === 'document_requests'`;
- adopts those cards in the primary buyer workspace, primary seller workspace, and advanced document view;
- rechecks each container's buyer or seller audience before rendering it;
- uses `uploadSpec.requestId` when uploading against a request container;
- keeps the older `additionalDocumentRequests` rendering as a compatibility fallback for stale payloads.

An empty `documentRequestContainers` array is authoritative. It does not trigger the legacy fallback. This prevents a professional-only legacy row from reappearing in a client portal after the container model has correctly filtered it out.

## Why The Fallback Remains

Some environments may still return payloads that do not include the `documentRequestContainers` field at all. Only those stale payloads use the fallback, preventing older portals from showing an empty additional-request tab during rollout.

## Verification

Run:

```sh
npm run verify:document-request-phase8-client-portal-container-adoption
```

The generated report is written to:

```text
output/document-request-phase8-client-portal-container-adoption.json
```
