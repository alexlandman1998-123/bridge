# Document Request Phase 2: Document Request Containers

## Status

Implemented as a shared container model and propagation gate.

Phase 2 gives the programme one normalized document request container shape for both canonical required documents and ad hoc requests created by agents, attorneys, and bond originators.

## Command

```bash
npm run verify:document-request-phase2-containers
```

This runs Phase 0, Phase 1, the Phase 2 container contract test, and writes:

```bash
output/document-request-phase2-containers.json
```

The report is read-only:

```json
{
  "commit": false,
  "mutatedData": false
}
```

## Runtime Contract

The shared container model lives at:

```bash
src/core/documents/documentRequestContainerModel.js
```

It normalizes:

- canonical rows from `transaction_required_documents`
- ad hoc rows from `document_requests`
- upload targets for required documents
- upload targets for additional requests
- visibility for buyer, seller, agent, attorney, bond-originator, client, and internal audiences
- readiness-blocking status
- linked uploaded document state

## Behaviour Now Enforced

- Buyer/seller ad hoc requests default to `client_visible` unless explicitly overridden.
- Bond-originator/internal/professional requests default to shared role-player visibility.
- One request row becomes one upload container.
- Upload specs identify whether the upload should attach to a canonical required document or an additional request.
- Buyer, seller, agent, attorney, and bond-originator projections can be derived from the same container set.
- The client portal document centre now returns `documentRequestContainers` and `documentRequestContainerSummary`.

## Known Follow-Up

Attorney lane-specific requests still write directly to `document_requests`. Phase 2 can project them because they land in the same table, but a later cleanup should route them through the shared request API or a thin adapter so group creation, notifications, and request defaults are identical.

## Exit Criteria

Phase 2 is complete when:

- canonical required rows and ad hoc requests normalize to the same container model
- buyer/seller request defaults are client-visible
- upload targets are stable
- portal projection exposes the container summary
- attorney, bond-originator, and agent request fixtures all appear in the correct audience model
- no database writes are performed by the Phase 2 report

The next implementation phase is Phase 3: buyer-side cleanup.
