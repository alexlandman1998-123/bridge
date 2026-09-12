# Document/storage acceptance — 11 September 2026

## Result

**Combined document acceptance passes. Five fixed-build cold loads now pass after
the follow-up buyer-read repair.** See [loading reliability](loading-reliability-20260911.md).
This is staging evidence, not a production release sign-off.

Repaired and applied to staging `vaszuxjeoajeuhlcnzzf` only. Migration ledger:
`20260911081342_document_storage_audience_boundary.sql` and
`20260911085953_document_visibility_choice_semantics.sql`. Both are recorded in the
staging ledger. The follow-up dependency reconciliation is recorded as
`20260911093833_reconcile_document_workspace_dependencies.sql`.
No production release or production migration.

Previously, transaction-spine SELECT policies exposed internal document metadata to
clients and internal stored files to professional read-only participants. Storage
also treated access to the matter as permission to upload. Seller reads did not
include transaction-linked shared documents.

The repair adds restrictive audience policies to metadata and stored objects, using
the same private predicate. Internal overrides the client-visible flag. Buyer/seller
recipient restrictions apply to metadata and bytes. Positive professional identity
uses the existing professional-journey authorization, not general participation.
Upload-before-metadata under transaction paths requires document-write capability.
Buyer and developer definer projections explicitly apply the audience predicate.
Other storage path families retain their existing policies; this is not a claim of
a complete audit of all storage buckets, RPCs, or unrelated private-listing tables.

## Executed tests

`node scripts/staging-document-storage-acceptance.mjs` passed against staging:

- Attorney, agent, developer, buyer, seller, anonymous, invalid buyer token, and
  invalid seller session tested across six audience configurations (48 cases).
- Each case checks document SELECT and signed URL retrieval plus actual byte download.
- Internal and internal+client-visible: attorney only.
- Professional/shared with client flag false: attorney, agent and developer only.
- Shared with explicit client flag true: all five authorized roles; anonymous/invalid sessions denied.
- Buyer-targeted: professionals and buyer, not seller.
- Seller-targeted: professionals and seller, not buyer.
- Attorney uploads object, inserts linked metadata, and saves visibility changes
  using the attorney session, not service-role privileges.
- Agent/developer read-only fixtures, buyers/sellers and anonymous users cannot
  upload to the professional transaction path or edit the test document.
- Buyer and seller can upload and read their own correctly scoped portal objects.
- Fresh journey RPC reads for all five roles return identical saved lane/task outcomes.
- All temporary labelled test records and objects removed, including portal uploads.
- Existing legal evidence and task outcomes were not overwritten or marked complete.

Also passed:

- `node scripts/document-signed-url-failure.test.mjs`
- `node scripts/seller-document-onboarding-visibility.test.mjs`

These are live API/storage tests, not a five-role browser interaction run. They
do not certify task completion/N/A/reopen UI flows as retested today.

## Document UI repair and verification

- Restored the upload modal's required-document selector and missing-selection validation.
- Preserved visibility, author, storage bucket and canonical linkage when an older
  schema lacks the optional upload-idempotency column. Other missing fields fail visibly.
- Corrected the visibility dropdown: professional-only no longer becomes client-visible.
- General uploads explicitly marked as not satisfying a requirement do not trigger
  inferred requirement/evidence follow-ups.
- Added Verify/Reject actions for linked uploaded evidence, including re-review.
- Selected category content now follows refreshed data, rather than retaining the
  original selected object.
- Generated legacy checklist statuses now follow the matched file's saved review
  outcome. Canonical requirement outcomes remain authoritative. Verified totals agree.

Attorney browser test against localhost:4177 with the staging backend completed:
labelled PNG upload, signed-URL image preview, approval, full reload, rejection,
full reload. File and OTP requirement displayed Verified after approval and
Rejected after rejection; Verified count changed from 1 back to 0.
The same browser-uploaded, client-visible file was subsequently read and downloaded
through attorney, agent, developer, buyer and seller sessions in its uploaded state.
The earlier combined rerun failed on reload. After the read-path repairs below, the
combined browser run passed upload, preview, approval, full reload, rejection and
full reload. All five role sessions read the same saved review status and downloaded
the permitted bytes at each of uploaded, approved and rejected states.

Passed regression tests: upload reliability, upload policy, canonical document review
UI, signed-URL failure, seller onboarding visibility, requirement review status
(including dashboard count assertions), and matter document workspace model.
`npm run build` passed (existing bundle-size/import warnings remain).

## Security review

New definer policy helpers are in the non-exposed `document_security` schema, have
fixed search paths, and return permission booleans. PUBLIC execution is revoked;
anon/authenticated execution is necessary for RLS. Portal branches validate scoped
tokens, including the existing password-protected seller session validator.
Existing unique `documents(file_path)` index supports the object lookup.

Supabase security advisors ran after changes: no findings name `document_security`.
The project still reports unrelated definer views, mutable search paths, public
definer RPCs and auth hardening warnings; this pass does not resolve them all.
See [Supabase database linter guidance](https://supabase.com/docs/guides/database/database-linter).

## Demo fixture repair

Three pre-existing demo records on MAT-1198 referenced absent objects:

- `a2ed99d4-8dc8-4fab-b6a2-e3fb688d7888` — Signed Nedbank Bond Pack.pdf
- `af2c0c2f-9a5b-463b-ab4b-19c3d3300de6` — Building Insurance Schedule - old.pdf
- `47053304-45c7-4cbe-bf46-69b12b98b082` — FNB Bond Statement.pdf

Replaced those empty demo references with conspicuously labelled, unsigned PNG test
samples. Their inherited approvals were cleared. Original demo metadata is retained
in `metadata.originalDemoRecord`; no genuine legal file was overwritten. These are
software-test fixtures, not signed packs, insurance schedules or bank statements.
All three repaired samples were successfully opened using the attorney's credentials
and confirmed to remain uploaded, not approved.
Cleanup removed nine disposable browser-test documents and their stored objects,
the single optional canonical test requirement, and one interrupted storage-test
document/object. The three repaired demo samples remain. Test row recovery data is
saved locally in `test-results/document-acceptance-cleanup.json`; fixture bytes can
be regenerated by the labelled test scripts. No genuine evidence was deleted.

## Follow-up read-path repair

- `sync: false` now reads saved canonical projections instead of resolving/writing
  them during a workspace read. Explicit synchronization still resolves requirements.
  This fixes a latent write-on-read path; the default legacy rollout does not exercise it.
- Live refresh combines active-tab, workflow and activity datasets into one deduplicated
  request and acknowledges known refresh revisions after successful refresh.
- Restored staging's missing health/audit tables, lane-delegation read table and
  security-invoker allocation lifecycle view. Existing workflow mutation permissions
  were not replaced. No matter backfill or timeout increases.
- Read-only projection, live-hook, live-refresh, review-status and signed-URL tests pass.
- A fresh build passes, with existing bundle-size/import warnings.
- The 48-case metadata/storage suite and five-role journey parity pass again.

## Remaining release qualification

Repeated browser acceptance encountered intermittent staging SQL statement timeouts
and workspace-loading delays. Missing compatibility tables were also observed:
`transaction_matter_health`, `transfer_firm_allocation_lifecycle_v2`, and
`attorney_lane_delegations`. A subsequent standalone 48-case storage/visibility and
five-role journey parity run passed. This is not evidence that intermittent loading
is fixed. Full release readiness remains open pending repeatable cold-load acceptance.
The final browser run returned PostgreSQL `57014` for `transactions`,
`transaction_required_documents`, and `transaction_subprocesses`; the UI displayed
“Documents could not be loaded”. `transaction_refresh_signals` also timed out earlier.
Those failures describe the earlier baseline. The combined browser and 48-case tests
subsequently passed after the repairs above. Cold-load qualification separately
reports telemetry writes denied by `error_events` RLS (403/42501); this is not counted
as a document API failure, but is not silently discarded. The journey can briefly
display unavailable while its separate loader finishes; one observed cold load
cleared that state after the refresh observation interval.

Final cold-load qualification did NOT pass: two consecutive fresh contexts passed,
but the third returned PostgreSQL `57014` from `buyers` and
`bridge_read_professional_matter_journey`. An earlier repeated run also lost the
selected OTP article after refresh. Do not replace these failures with the successful
functional run or classify the timeout issue as resolved. The added
`scripts/document-cold-load-acceptance.mjs` checks the saved rejection after a full
live-refresh interval, fails on workspace API errors, and reports telemetry separately.
Next investigation is the authenticated buyer/journey read path and its RLS/query
cost under concurrent workspace hydration; no production release is approved here.
The follow-up run's one disposable document/object and optional canonical requirement
were removed after testing. The three labelled demo samples were rechecked and
remain accessible, unsigned and unapproved. Cleanup recovery metadata is local;
test bytes are reproducible from the fixture script.

Previously issued signed URLs remain usable until expiry; changing audience prevents
new unauthorized URLs but does not revoke existing ones.
