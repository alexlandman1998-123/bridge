# Document Request Phase 10: Release Readiness

Phase 10 is the consolidated readiness gate for the document request programme.

## Scope

- Reads the Phase 0 to Phase 9 reports.
- Confirms every phase report is present, phase-matched, and read-only.
- Confirms canonical policy, buyer cleanup, seller cleanup, bond model, workspace containers, portal container adoption, and upload linking are still wired.
- Confirms all eight workspace audiences are covered, including transfer attorney, cancellation attorney, and internal users.
- Confirms the professional-visibility migration and document-request RLS policy contracts exist in source control.
- Confirms Phase 8 and Phase 9 use their current v2 contracts, including authoritative empty-container handling and agent upload-on-behalf.
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

`gate.ok: true` means the implementation is internally consistent and can proceed to Phase 11.

`gate.internalPilotReady: true` additionally requires target-environment evidence. Local source checks alone never declare a Supabase environment pilot-ready.

`gate.productionActivationReady: false` means the system should not be treated as fully production-ready until pending activation items are signed off, retired, or converted into hard requirements.

## Environment Evidence

Copy `docs/document-request-phase10-environment-evidence.template.json` outside the tracked workspace, run the checks against staging or production, and mark a check `true` only after observing it. Do not include client names, emails, signed URLs, tokens, or service-role keys.

The evidence must prove:

- the Phase 6 professional-visibility migration is applied;
- `document_requests` RLS is verified for the relevant roles;
- buyer and seller portal uploads link to the exact request;
- an agent upload on behalf of a client links to the exact request and retains proxy attribution;
- professional-only requests remain hidden from buyer and seller portals.

Run the fail-closed environment gate with:

```sh
node scripts/document-request-phase10-release-readiness.mjs \
  --environment-evidence=/absolute/path/to/redacted-evidence.json \
  --require-environment-evidence
```

Without evidence, the normal verification command reports `implementation_ready_environment_validation_required`. This is not a failure of the implementation chain, but it keeps both pilot and production activation closed.

Run:

```sh
npm run verify:document-request-phase10-release-readiness
```

The report is written to:

```text
output/document-request-phase10-release-readiness.json
```
