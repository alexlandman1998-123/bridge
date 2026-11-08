# Property24 and Private Property listing diagnostic — 8 November 2026

## Preventive follow-up after production reconciliation — 8 November 2026

**Current status: fixes isolated locally; production unchanged in this task.** This follow-up supersedes the earlier release-status statements below. The earlier listing work was subsequently included in the production reconciliation. Current main/base is `963beff01957e338f4cf330f495105fd29247153`; its primary-app source matches deployed commit `13972f32d4e7404cd3d50053f864023f3fb8a7ce`. The live primary app is READY on deployment `dpl_F5JP3gBYvPp4gjFxVVCQWp51bDdN`. New work is on `codex/listing-prevention-20261108` in an isolated worktree, preserving unrelated bond and website edits.

### Additional preventable defects fixed

| Finding | Result of this follow-up |
| --- | --- |
| Private Property swallowed interrupted response bodies after receiving HTTP headers. A failed read could become an empty successful status/feed. | Body-read failures now propagate. Timeouts retain uncertainty; there is no automatic repeat of possible mutations. |
| A refreshed private photo retained its previous `mediaLoadError`, so a recovered file could stay blocked. | Successful renewal clears the recovered photo's flag without mutating caller data. Storage denial remains a blocker. |
| Expiry receipts discarded provider explanations and treated pending rental requests/nested unconfirmed outcomes as definite failures. | Expiry receipts retain bounded, redacted provider explanations and keep ambiguous requests protected as uncertain. |
| Private Property reconciliation marked under-offer adverts as off-portal. | A confirmed under-offer advert remains on-portal, consistent with ordinary status handling. |
| Photo limits applied separately to each download; a long gallery or stalled storage fallback could outlast the listing worker. | The gallery has one 120-second preparation allowance, including storage fallback/decoding waits. It retains two workers, ordering and all original files. Timeout fails the entire readiness check with a photo-specific explanation; no partial gallery is submitted. |
| Private Property feed/show-day cron had a 60-second ceiling while doing multiple sequential provider operations. Production error clusters include historical timeouts on this route and the listing worker. | This cron uses the same 300-second ceiling as listing publication, with a shared 240-second work allowance and 30-second reserve before starting more provider work. Deferred feeds retain checkpoints; deferred show days are not marked synced or sent. Existing eligible work resumes on the next tick. |
| Show-day updates trusted HTTP 200 without checking the SOAP business result. | Empty, negative and unacknowledged responses fail; positive acknowledgements are required before recording success. |

Scope: primary app capture, save/reopen, media, readiness, publication, expiry, status recovery and portal feeds. No database migration, Edge Function, public-website or admin source change is required. The new function duration can increase permitted runtime for that cron; deployment approval includes this configuration change.

### Production evidence and exceptions for the coming week

Read-only production target: `isdowlnollckzvltkasn`.

- No queued/processing/dispatching publication job was older than ten minutes at inspection.
- Both enabled production Private Property feed connections were approved and recently checked. Production syncs contain 16 active, two under-offer and eight inactive adverts; the six previously reconciled records retain their resolved states, and no production sync is submitted or unknown. These are saved status observations, not a fresh public-page certification of every advert.
- No saved channel expiry falls in the next seven days. This does not establish that external portal dates or unsaved expiry choices are correct.
- Three rental withdrawal journals remain uncertain from 3 November. **Fresh read-only `GetListingStatus` and `GetListingsDetails` calls verified all three exact existing identities as Inactive:** `rr4801805`, `rr4812937`, `rr4789012`. No provider or database write occurred. A guarded repair is prepared to reconcile only these three receipt rows, retaining payload digests, original identities and existing receipt evidence. It refuses stale proof (30 minutes), changed rows or inconsistent syncs. It must be refreshed and approved before execution.
- Three older website publication requests remain uncertain. One has a saved published projection older than the uncertain request; two have no current website projection. Neither an old published row nor absence establishes the outcome of that later request. They are not safe to replay blindly.
- One old failed Property24 request still contains only “Channel needs attention.” The same advert is recorded on-portal, with a later check. This does not establish whether the failed content update took effect. Its lost historical reason cannot be reconstructed or relabelled as success.
- Some active internal listings have no `listing_media` image rows. Internal activation is not proof of portal readiness; the existing readiness checks must continue to block incomplete adverts. No blanket photo, status or mandate backfill was attempted.
- Historical runtime error clusters list listing-publication and Private Property reconciliation timeouts, last seen 7 November. The cluster's first occurrence predates the requested week, so its count is not presented as a clean seven-day total. The current deployed revision had no error/warning runtime log lines in the inspected window. A wider raw-log query timed out; this limitation is preserved.

### Provider contract comparison

Fresh HTTPS retrieval succeeded for the [Property24 v55 definition](https://api.property24.com/swagger/v55-listing/docs) and [Private Property WSDL](https://services.privateproperty.co.za/AgentImport/AgentImport.asmx?WSDL). Private Property's WSDL is byte-identical to the stored fixture. Property24 has two changed description fields; its structural request/response contracts and parameters match after excluding descriptions. These checks do not certify private partner agreements, agency entitlements, credentials, catalogue choices or delivery of a new live advert. Provider mutations remain mocked in automated tests.

### Verification

- **1,470 tests passed across 161 listing/rental Vitest files.** The initial broader run found an unconfigured local test connection and an upload test assuming that a lost reply could not recover immediately. Those fixtures were corrected without changing the affected production workflows. The final full selection passes with no skipped tests.
- **196 focused Node checks passed**, including all seven property categories, both transaction modes and both portal contracts; changed/unchanged galleries, job claims/access isolation, failure receipts, the new gallery deadline, expiry safeguards, interrupted SOAP responses, show-day acknowledgements and deferred feed checkpoints.
- **98 publication browser assertions passed** across all seven categories and both sale/rental modes, including partial failure, reload, targeted retry, narrow screens and lost responses. A full matrix plus an isolated agricultural-sale rerun supplies the final per-journey evidence. Initial fixture races assumed that status buttons remained present after automatic confirmation and that all channel requests finished together; the corrected harness waits for the original action, accepts automatic confirmation only with the exact receipt visible, and still forbids resends.
- **14 additional capture/recovery assertions passed** across sale and rental journeys: offline saving, restored capture sessions, interrupted photo upload, same-record retry, fresh-browser reopen and conflicting remote edits. The old harness was updated for the optional sales step, explicit capture-session restoration and private draft creation during sales photo upload. A new unrelated capture remains separate. These checks used the final sale rerun and the verified rental journey; failed exploratory runs are retained.
- The prepared three-row withdrawal repair passed local PGlite checks: only the exact three receipts change, an unrelated row is preserved, and a changed target causes a full transaction rollback. It has not run against production.
- Scoped ESLint and whitespace checks pass. No full local production build was attempted because of the machine's memory limits and prior build failure. A cloud build remains necessary before promotion.

Browser providers, accounts and storage responses are local fixtures; rental saving exercises local PostgreSQL. Actual provider status reads for the three withdrawals are separately evidenced. No new advert, withdrawal, reactivation, email, migration, production code promotion or data repair was performed.

### Release and approval scope

Release the isolated listing commit to the primary `bridge` app only, including its API bundles and the one cron-duration configuration. **Zero migrations and zero Edge deployments.** Use a cloud build, inspect READY/build output, then verify authenticated sale/rental routes and read-only status/permission checks before promoting. Recovery is the prior primary-app deployment; preserve all correct portal identities and receipts.

A separate, optional production-data approval is needed for `output/listing-prevention-20261108/withdrawal-repair-prepared.sql`, affecting exactly three verified inactive withdrawal receipt rows. Re-read the provider immediately before applying and retain the before snapshot; no advert or listing data changes are included. The three website requests and old Property24 update require targeted investigation, not automatic retries or receipt deletion. Any live publish/update/withdraw acceptance requires named, explicitly approved test listings and channels.

`AGENTS.md` requires current-task approval for production deployment, remote data changes and publishing. This review prepares the fixes and evidence; it cannot promise a fault-free week or certify an unperformed live submission. Evidence and the exact release manifest are in `output/listing-prevention-20261108/`.

## Earlier diagnostic and release preparation (historical)

> **Follow-up completed on 8 November:** both updated browser journeys now pass on the isolated release candidate (14 checks). A further 394 candidate automated checks and scoped lint passed. The six Private Property records were matched against their saved portal identities and reconciled under the user’s explicit follow-up instruction: four active and two under offer, with no portal writes. The original findings below are the historical diagnostic; the remaining approval steps and exact release scope are in [the isolated release approval packet](../output/listing-release-20261108/APPROVAL.md). Cloud build and promotion have not been performed.

Owner: the primary Arch9 transaction workspace (`the-it-guy/`), including its provider API routes, background publication worker and listing screens. Public property websites and the admin application were not changed. The previously prepared WhatsApp release remains separate.

## Outcome

The review confirmed that useful portal explanations were being lost between provider responses, background receipts and screens. Local fixes now retain field validation, SOAP business faults and photo-specific explanations, with a support reference for failed or unconfirmed background requests. Unknown sale submissions are no longer presented as safe failures to retry. Property24 read retries share a deadline, and progress watching avoids overlapping reads and unchanged notifications.

This is **not a green live release certification**. No listings were submitted, withdrawn or republished, no remote data was changed, and no deployment was made. Two older full publication browser journeys stopped before submission because their assumptions no longer match the current editor. Their limitations are recorded below.

## Scope traced

- Capture, draft recovery, save/reopen and decimal field persistence.
- Organisation/agent authorisation, agency/branch configuration and provider identity.
- Readiness checks, location resolution, mapping and outgoing provider contracts across supported categories and sale/rental modes.
- Photo preparation, payload limits, signed media identity and unchanged-gallery handling.
- Durable enqueue, actor-scoped dispatch, independent channel outcomes and receipt persistence.
- Provider acceptance versus confirmed live status, partial failure, retry targeting and lost responses.
- Status monitoring, feed reconciliation, reference retention, withdrawal and rental recovery safeguards.

## Confirmed findings and repairs

| Priority | Finding | Local repair / remaining limit |
| --- | --- | --- |
| High | Property24's generic HTTP error could hide `ModelState`/validation details inside a summarized response. | Shared error extraction reads the detailed envelopes and keeps field names and reasons. Readiness blockers outrank a generic top-level summary. |
| High | Private Property explanations could sit under `report.apiResponse.error`, `faultString` or `responseSummary.resultText`; the UI instead showed a broad failure or removed the entire SOAP fault. | Those envelopes are now read. Useful business explanations survive; XML wrappers, stack frames and credential fragments are removed. |
| High | Escaped worker exceptions lost their cause, producing generic durable receipts. | The worker passes the exception through the same bounded, sanitized error extractor. Unknown outcomes still remain unconfirmed. |
| High | Sale submissions lacked the rental attempt journal, so a timeout could be classified as a definite failure. | Uncertainty classification now applies independently of the rental journal for both providers. Timeout, rate-limit and server-failure cases remain unconfirmed; definite client rejection remains fixable. |
| High | A successful Property24 HTTP response without a usable listing number could appear accepted for a sale. | Missing, zero or invalid references now leave the outcome unconfirmed and do not write a false local sync record. |
| Medium | Progress receipts cut useful detail to 240 characters and supplied no durable request reference. | Failure receipts permit up to 800 characters and show the job ID as a support reference. Channel management and the sale listing detail screen use sanitized detail too. |
| Medium | Property24 GET retries received a fresh 25-second timeout, allowing roughly 50.6 seconds per failed read. | Attempts share the original 25-second deadline; a retry that cannot fit is skipped. Writes still get one attempt. Aborted response-body reads are no longer swallowed as successful empty data. |
| Medium | Visibility changes could overlap status reads, while unchanged results emitted repeated UI events. | A watcher permits one in-flight read, coalesces requested refreshes and suppresses unchanged result notifications. Hidden-tab and settled-job behaviour remains covered. |

The error reader deliberately extracts bounded error fields rather than displaying or serializing full provider payloads. It shows up to four distinct reasons; the full readiness checklist remains the place to review all requirements. Database implementation failures give a support action rather than exposing schema internals.

Example: a response previously represented by `Property24 POST … failed with 422` can now show `listing.price: Price must be greater than zero; listing.agentId: The agent must belong to this agency`, followed by the save/correct/retry action.

## Read-only production findings

Target: production Supabase project `isdowlnollckzvltkasn`. Queries returned aggregates and status metadata; credentials, listing payloads and customer contact details were not exported.

- One failed Property24 durable job actually contains only **“Channel needs attention.”** This confirms the complaint in stored data. The original upstream cause cannot be reconstructed from that receipt alone; the fix improves future receipts rather than inventing a historical explanation.
- Production stored sync states: Property24 22 on-portal / 8 removed; Private Property 12 active / 8 inactive / 4 submitted / 2 unknown. Sandbox and ExDev rows are excluded from these figures.
- Four locally active sale listings remain submitted on Private Property. All have portal references; their last recorded listing checks range from 15–24 October.
- Two locally under-offer sale listings have unknown Private Property status. Both have references; their last recorded checks are 2–3 November.
- The two enabled, approved production Private Property feed connections were checked successfully around 13:10 UTC on 8 November, about eight minutes before inspection. A running feed therefore does not establish that every old unresolved listing has been reconciled. The source consumes new feed events; there is no demonstrated periodic status-probe sweep guaranteeing resolution of every old submitted/unknown record.

The six unresolved records need targeted status reconciliation against their existing portal identities. **Do not resend them as new adverts.** No claim is made here that they are offline: the database states are unresolved, not public-page proof.

### Speed evidence

Last seven days of stored worker timing activity:

| Channel | Samples | Average queue wait | Average processing | Slowest processing |
| --- | ---: | ---: | ---: | ---: |
| Property24 | 9 | 0.34 s | 54.35 s | 89.97 s |
| Private Property | 4 | 0.31 s | 7.78 s | 18.99 s |

The samples suggest processing, rather than queue wait, deserves attention. They do not isolate whether photos, upstream network calls or repeated planning reads account for Property24's time. The deadline repair bounds a slow retry path; it is **not evidence that all Property24 submissions now finish in 25 seconds**. There is no post-deployment speed result yet.

Existing photo safeguards already avoid retransferring a confirmed unchanged gallery. The contract/photo checks verify that changed order, cover, replacement and removal still resend when required. Photo concurrency was not increased: memory and payload budgets remain important. A useful next measurement is time spent in readiness, image download/encode, provider submission and local receipt persistence, using the existing job reference.

## Verification

All checks ran locally and serially where memory intensive, without a production build.

| Check | Result |
| --- | --- |
| Provider contracts, mapping and unchanged/changed photo matrix | 154 passed |
| Durable queue/RLS, worker outcomes, error extraction and API/monitor scripts | 23 passed |
| Sale/rental uncertainty recovery, request deadline, progress watcher, management dialog and rental channel service | 146 checks verified; see timing note below |
| Scoped ESLint on the ten changed source files | Passed; Babel noted the pre-existing large listing-detail module |
| Diff whitespace check on the changed source scope | Passed |
| Residential sale/rental browser capture, validation, save and reopen | 12 passed |
| Older full publication browser journey | 2 preliminary checks passed; 2 journeys incomplete before submission |

The three automated suites total **323 passing checks**, plus 12 passing browser checks. Repeated verification runs are not added to these totals. A final combined rerun hit the existing 5-second timeout in one management-dialog test (145 passed / 1 timed out). Running that dialog file alone then passed all 53 tests, including the timed-out retry case, without changing the timeout or increasing the heap. This timing sensitivity is retained in the evidence; it is not a hidden clean combined rerun.

Focused automated commands, from `the-it-guy/`:

```sh
node --test --test-concurrency=1 scripts/listing-diagnostic.cases.mjs server/tests/listingPhotoChange.test.js scripts/property24-phase1-smoke.test.mjs scripts/rental-property24-api-preview.test.mjs scripts/rental-property24-api-publish.test.mjs
node --test --test-concurrency=1 server/tests/listingPublicationJobs.test.js server/tests/listingPublicationWorker.test.js src/services/listings/__tests__/listingPortalError.test.js scripts/property24-api-layer.test.mjs scripts/property24-publish-listing.test.mjs scripts/private-property-browser-api.test.mjs scripts/private-property-phase6-sync.test.mjs scripts/private-property-phase11-post-submit-monitor.test.mjs
NODE_OPTIONS=--max-old-space-size=1024 npx --no-install vitest run server/tests/rentalPublicationRecovery.test.js server/tests/property24RequestDeadline.test.js src/services/listings/__tests__/listingInitialPublicationService.test.js src/components/listings/__tests__/ListingPublicationProgress.test.jsx src/components/listings/__tests__/ListingChannelManageDialog.test.jsx src/services/rentals/__tests__/rentalListingChannelService.test.js --maxWorkers=1
```

### Browser limitation

The older `listing-recovery-browser.test.mjs` publication mode expects “Save and publish changes” for an existing sale; the actual screen offers “Save & update adverts”. Its rental recovery setup also stops on an earlier step with Continue rather than reaching its expected final submit button. Neither journey reaches provider submission. These failures are preserved, not dismissed as passing end-to-end tests or claimed as proof that the product itself cannot submit.

The harness must be updated to use current capture-session recovery and to distinguish initial publication from updating existing adverts. It must then recheck partial failure, reload, targeted retry and lost-response recovery in the complete browser journey. The component, API and worker checks already cover those behaviours separately.

Browser traffic was restricted to the local fixture. Vendor-schema checks use repository snapshots; attempts to retrieve the current Property24 Swagger and Private Property sandbox WSDL were unsuccessful. Current upstream contract parity is consequently unverified. A full production build remains unverified because of this machine's memory limits and its earlier build memory failure; no larger-heap retry was attempted.

## Remaining work before calling this live and fully verified

1. Repair and rerun the older publication browser journeys against the current editor. Retain the assertion that only the failed destination is resent and the same saved listing is retained.
2. Prepare an isolated listing release from an identified deployed baseline. This working tree contains substantial unrelated changes; deploying it wholesale would not represent this diagnostic's scope.
3. Obtain explicit deployment approval, build in the cloud, and run a controlled sale/rental acceptance with an agency administrator and known portal accounts. Verify validation errors, acceptance, references, photos and the actual public pages on both providers.
4. Reconcile the six existing Private Property records by their saved identities. Any production database repair, status change or republish requires separate explicit approval under the repository rules. Read-only portal verification can be used first.
5. Measure live processing after release and address the largest measured phase. Consider a bounded, observable reconciliation sweep for old pending/unknown records; the present evidence does not establish why these six records missed a final state.

No database migration or provider credential change is required for the local repairs made here. No request to approve live writes is being made on the basis of an incomplete browser release check.

## Evidence and source changes

Logs and the sanitized production aggregate snapshot: `output/listing-portals-diagnostic-20261108/`.
Browser evidence: `output/playwright/listing-portals-review-20261108/` and its `publication/` subdirectory, including both incomplete journey snapshots.

Source changes are limited to:

- `src/services/listings/listingChannelUpdateState.js`
- `src/services/listings/listingInitialPublicationService.js`
- `src/services/rentals/rentalListingChannelService.js`
- `src/components/listings/ListingPublicationProgress.jsx`
- `src/components/listings/ListingChannelManageDialog.jsx`
- `src/pages/AgentListingDetail.jsx` (narrow message/detail handling changes)
- `server/services/listingPublicationJobs.js`
- `server/services/property24Client.js`
- `server/property24/publishService.js`
- `server/services/privatePropertyControlledPublishService.js`

Seven focused test files were added or extended for the regression cases. Existing unrelated modifications in these files and elsewhere were preserved. Nothing was staged, committed or released.
