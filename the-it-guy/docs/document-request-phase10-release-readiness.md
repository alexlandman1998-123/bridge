# Document Request Phase 10: Release Readiness

Phase 10 is the consolidated readiness gate for the document request programme.

## Scope

- Reads the Phase 0 to Phase 9 reports.
- Confirms every phase report is present, phase-matched, and read-only.
- Confirms canonical policy, buyer cleanup, seller cleanup, bond model, workspace containers, portal container adoption, and upload linking are still wired.
- Aggregates managed warnings into one pending activation list.
- Produces a single release recommendation.

## Managed Warnings

Managed warnings are allowed to pass the Phase 10 gate, but they keep production activation closed. They represent known policy or operational decisions, not broken code paths.

Examples:

- Legal/policy sign-off still pending for conditional seller certificates.
- Legacy buyer/seller generators still exist behind canonical overlays.
- Bond child documents still roll into parent income/affordability containers.
- The client portal still keeps a legacy additional-request fallback.
- Seller portal request-linking is guarded if direct `document_requests` access is blocked by schema or RLS.

## Gate Meaning

`gate.ok: true` means the programme can proceed to the next implementation or pilot phase.

`gate.productionActivationReady: false` means the system should not be treated as fully production-ready until pending activation items are signed off, retired, or converted into hard requirements.

Run:

```sh
npm run verify:document-request-phase10-release-readiness
```

The report is written to:

```text
output/document-request-phase10-release-readiness.json
```
