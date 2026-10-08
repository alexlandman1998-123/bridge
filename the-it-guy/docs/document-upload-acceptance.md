# Document persistence acceptance

The primary Arch9 transaction workspace owns this check. Phase 5 adds a complete
acceptance inventory and repeatable local regressions. It does **not** certify
every production upload journey from local tests or a Storage catalog query.

## Run the focused regressions

From the repository root:

```sh
npm --prefix the-it-guy run test:document-upload-release-readiness
npm --prefix the-it-guy run test:storage-upload-fallback-hardening
npm --prefix the-it-guy run test:canonical-document-upload-path
```

The readiness command checks the gate, evidence artifact validation, fresh-link
signing, developer lead access and the changed download control. Its browser test
uses the actual component and Supabase Storage SDK against local HTTP fixtures.
It hashes three downloaded files, checks reopening and replacement, invalidates
the original link and denies a revoked viewer. Those authorization fixtures are
**not hosted RLS tests**. Chromium must be installed for Playwright.

The existing `scripts/seller-document-journey.test.mjs` runs browser signing and
upload journeys through real local PostgreSQL routines. Its Auth, email and
Storage infrastructure are synthetic. Existing rental suites execute PostgreSQL
fixtures for participant scope, closed/expired access, current requirement
generations, retained evidence and idempotent completion. Run Node test files
with Node, not Vitest (`developmentMediaStorage.test.js` is a Node test).

## Hosted acceptance packet

The registry is `src/services/documents/documentUploadReleaseReadinessService.js`.
It contains all 27 audited areas and 48 variants: finance proofs, requested files,
signed copies, multi-file packs, templates and other distinct upload flows do not
inherit a pass from a neighboring flow. Each variant needs eleven observations:

| Scenario | Required observation |
| --- | --- |
| upload | Saved metadata, existing object, source byte count and SHA-256 |
| persistence | Fresh metadata/object read with the original document ID, bucket and path |
| visibility | Expected viewer sees the file; review status remains intact |
| download | Downloaded byte count and SHA-256 equal the uploaded source |
| retry | Injected failed reply recovers exactly one metadata row and one object |
| failedNetwork | Interrupted request recovers exactly one metadata row and one object |
| reopen | A new session/page reads the same durable document and existing object |
| replacement | New path is latest after a fresh read; previous document/version remains retained; bytes match |
| expiredUrl | Old signed URL actually fails; a newly requested link downloads the source bytes |
| roleAccess | Assigned actor can download; an unassigned actor cannot read metadata or storage |
| tenantIsolation | A different tenant cannot read metadata, download bytes or write into the owner's destination |

Prepare a blank packet locally (all 528 cases start `not_run`):

```sh
cd the-it-guy
node scripts/document-upload-acceptance.mjs --prepare \
  --output output/document-persistence-acceptance-template.json
```

For a hosted run, first identify the deployed build, actual Supabase project,
authorized actors in two isolated test tenants and the owning upload destinations.
Use harmless diagnostic documents in the owning UI. Upload, record the durable
receipt, reopen a new page, download/hash bytes, replace the file, inject request
failure and retry. Use the same saved destination when checking denied actors.
Keep legal review/publication and signature authenticity checks in their owning
workflow; a storage upload is not approval or publication.

**Do not run hosted uploads or attempted writes without explicit current-task
approval.** The repository AGENTS.md requires approval for commands that write
remote data. Fault injection must be limited to these authorized test journeys.
Do not test with customer files or bulk-clean up historical evidence. Phase 4's
prepared historical repairs require their own approval and are independent.

Each receipt records `mode: hosted`, `status: passed`, `checkedAt`, the exact
`surfaceId`, `variant`, `scenario`, and its target
`environment` (`preview`, `staging` or `production`), `projectId`, `buildId` and
`runId`, an `observation` using the fields above, and a relative `artifact` filename
plus its `artifactSha256`. Evidence expires after 24 hours and cannot be from a
future timestamp. Store sanitized reports beside the packet; exclude service
keys, access tokens, signed URL query tokens, document bodies and personal data.

Receipt identity fields are `documentId`, `bucket` and `path`. Upload includes
`metadataSaved`, `objectExists`, `sourceSha256`, `sourceBytes`; download includes
`expectedSha256`, `actualSha256`, `expectedBytes`, `actualBytes`. Other exact fields
are defined by `validObservation` in the registry service. A test runner may
collect these assertions, or a reviewer may record observed results with artifacts.
Receipts are reviewed assertions, **not cryptographic attestations of execution**.

Upload also records the UI's `intendedContext`. Every scenario records the saved
`recordContext`, with `tenantId`, `ownerType`, `ownerId`, `slotKey` and `partyId`.
Normalize the actual owning row and requirement/person association into these
fields; use an explicit `not_applicable` party only for a flow without a person.
Both contexts must match. A byte-perfect file attached to another transaction,
tenant, person or requirement is a failed journey.

Validate the completed packet locally, explicitly naming its intended target:

```sh
node scripts/document-upload-acceptance.mjs \
  --evidence output/acceptance/evidence.json \
  --environment preview --project ACTUAL_PROJECT \
  --build DEPLOYED_BUILD --run ACCEPTANCE_RUN \
  --output output/acceptance/readiness.json
```

This command has no remote access or write mode. It verifies artifact presence,
directory boundaries (including symlinks), SHA-256 and receipt scope. Missing,
local-only, mismatched, stale or invalid evidence exits unsuccessfully. It also
preserves the existing migration and malware-scanner release prerequisites.
Merely running gate unit tests does not satisfy those prerequisites.

## Fixes and remaining coverage

Attorney closeout, bond closeout, developer lead and the legacy shared Documents
panel now sign durable file locations when clicked, instead of opening cached
URLs. Developer lead access re-reads the lead's transaction and visible documents
before signing. A saved bucket is authoritative; access denial or a missing object
cannot search for a same-named file in another bucket. A legacy record without a
bucket tries another candidate only when the bucket itself is missing. The
metadata fetch helper uses the same rule and returns unavailable on failed access.

Download failure retains the saved file and permits retry. Switching documents
or leaving the screen discards an outstanding old link. A popup blocked by the
browser reports an actionable error. URL-only historical rows cannot be silently
treated as durable storage records; use reviewed reconciliation instead.

Hosted coverage is still required for all 27 areas. In particular, cached links
in client finance, seller offer evidence and legal packet final-version views need
their token-bound/publication-bound opening journeys exercised. Mobile draft
metadata and development media beyond supported document types remain separate
follow-ups from the earlier audit. The acceptance gate deliberately stays blocked
until the owning journeys supply genuine hosted observations.
