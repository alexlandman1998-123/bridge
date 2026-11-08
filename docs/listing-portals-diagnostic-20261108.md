# Property24 and Private Property listing diagnostic — 8 November 2026

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
