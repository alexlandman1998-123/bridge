# Listing fields: portal contract audit

Audited 10 October 2026. Owner: primary Arch9 workspace and its existing portal adapters. This covers ordinary sale and rental creation, including residential, commercial, industrial, retail, mixed-use, agricultural and vacant-land categories.

## Sources and evidence

- Property24 Listing Service **v55**, downloaded from <https://api.property24.com/swagger/v55-listing/docs>. Checked Listing, PropertyInfo, PropertyFeatures, CommercialInfo and RentalInfo schemas and enums. The local audit copy is `tmp/listing-contract-audit-20261010/property24-v55.json` at repository root.
- Private Property **Agency Feed Service Rev 4.7**, supplied PDF `Agency Feed Service - Rev 4.7-1.pdf`: listing fields pp.14–20, attribute matrix and Appendix B moderation rules pp.100 onwards. The extracted local audit copy is `tmp/listing-contract-audit-20261010/private-property-rev47.txt`. Private Property supplies the feed contract through its integration team: <https://helpdesk.privateproperty.co.za/portal/en/kb/articles/getting-started-with-a-feed-integration>.
- Actual Arch9 mappers: `server/services/property24ListingMapper.js`, both rental adapters and `server/services/privatePropertyListingMapper.js`.
- Website publication RPC and Edge Function; notably `supabase/migrations/20260916121032_website_listing_optional_metadata.sql` at repository root. It supersedes older mandatory suburb/property-type rules.

These are contract and local implementation checks. They do not prove a particular agency connection is enabled, that hosted migrations match the repository, or that a portal has accepted a live listing.

## Required fields by channel

| Field or setting | Property24 | Private Property | Website |
| --- | --- | --- | --- |
| Seller/landlord name, contact or CRM record | Not required by listing payload | Not required; OwnerID is optional | Not required |
| Signed mandate, mandate pack, FICA, disclosure, internal marketing approval | Not listing prerequisites | Not listing prerequisites | Not listing prerequisites |
| Agency and agent connection | Connected agency and mapped contact agent IDs | Approved branch and mapped agent IDs | Published site, active domain and permitted organisation/destination |
| Price | Positive price or sale POA | Positive amount; sale moderation minimum R10,000, including a numeric amount when hiding price with POA | Positive amount or explicit sale POA; POA hides the numeric public price |
| Description | Required | Required, maximum 4,000 characters; no URLs, telephone numbers or physical address in public copy | Not a publication prerequisite |
| Title | Optional descriptionHeader | Headline optional | Required; generated from property/address when no custom title is entered |
| Photos on initial publish | At least one | At least three for sales and rentals | At least one HTTPS image, copied to durable public media automatically |
| Location | Property24 suburb ID, resolved from address | Street number/name; suburb/town/province for text matching, or supported suburb lookup; sectional-title unit and complex | Suburb and property type are optional metadata |
| Property type/category | Valid catalog type ID | Residential, Commercial, Farms or Land with the relevant type attribute | Optional metadata |
| Floor size, zoning, parking | Optional; supplied values must fit schema | Optional except positive land area for Land | Optional |
| Residential beds/baths | Optional | Bedrooms required (zero allowed); bathrooms required and greater than zero | Optional |
| Rental deposit | Optional | Known amount required; zero is valid, including explicit No deposit | Optional |
| Rental availability / lease period | Optional | Optional | Optional |
| Rental cadence | Month, Week, Day, Year, SquareMetre | PerMonth, PerWeek, PerDay; PerM2 only Commercial/commercial land. Annual unsupported | Amount and cadence retained; labels reflect month/week/day/year/m² |
| Expiry | Required API date, initial default 90 days independent of mandate | Deprecated feed expiry is not an agent capture prerequisite | Not a capture prerequisite |
| Required feature enums | Adapter supplies supported unknown/default schema values; no new user checklist | Category-specific attributes below | No user checklist |

Private Property's feed `MandateType` is an API enum (sale/rental/house-share etc.). It does **not** require Arch9's signed mandate workflow to be completed. Full/sole mandate exclusivity and auction-specific metadata remain conditional features. No legal compliance conclusion is implied by the API contract.

## Category coverage

| Arch9 category | Property24 type IDs / transactions | Private Property mapping / special requirement |
| --- | --- | --- |
| Residential | House 4, Apartment 5, Townhouse 6; Sale + Rental | Residential; HomeType, bedrooms, positive bathrooms |
| Commercial | 11; Sale + Rental | Commercial; BusinessType |
| Industrial | 12; Sale + Rental | Commercial; Industrial BusinessType |
| Retail | 11; Sale + Rental | Commercial; Retail BusinessType |
| Mixed use | 11; Sale + Rental | Commercial; subtype mapped by adapter |
| Agricultural | 10; Sale + Rental | Farms; FarmType |
| Vacant land | 8; Sale + Rental | Land; positive LandArea and unit; LandType defaults to residential land |

The old Property24 commercial-rental, land-rental and industrial category blocks were Arch9 restrictions. v55 exposes the relevant category fields and Rental transaction schema. Those blocks are removed locally. Missing zoning, parking and floor/land size no longer block Property24; malformed supplied measurements still do. Private Property's positive land area requirement remains channel-specific.

House-share remains unsupported in the current Property24 adapter and is explained before submission. Private Property supports it. Auction-specific workflows, institutional mandate types and special price presentations must still use their documented adapters; ordinary activation does not fabricate those settings.

## User flow and findings

- Choose channels in Property details, so their field requirements are known while capturing. Address/type issues appear there, description/photo issues in Marketing, and rental price/deposit/cadence issues in Rental terms. Review links return to the relevant step. Requirements disappear when their channel is deselected.
- New sales listings defer seller capture. New rentals defer landlord and mandate capture. Missing mandate, internal approval, availability, pets or deposit policy do not create a Property24 publication gate. Supplied optional data is still validated rather than silently replaced.
- Submit & activate saves and verifies property details/photos, then starts selected channel requests concurrently and opens the saved record. Agents do not need a separate readiness-check/prepare/publish sequence for initial submission. Background receipts distinguish submission, rejection and uncertainty; live status requires external confirmation.
- Website initial submission previously left `listing_publication_data.status` as Draft, which the website function refuses to publish. Initial activation now prepares that projection automatically before requesting publication.
- Website pricing previously required a numeric price even for explicit POA, and the renderer labelled all rentals per month. The forward migration and website renderer now preserve explicit POA and the captured rental cadence.
- Property24 rental publishing has a server enablement setting. Rental capture checks it up front through channel availability. Changing that hosted setting is separate from changing listing fields.
- Channels remain for subsequent updates and individual withdrawals. Landlord CRM stage transitions and document signing remain separate workflows; no signed evidence is fabricated by listing activation.

## Remaining provider checks and practical limits

Client validation cannot prove a free-text suburb matches a portal catalog, detect a duplicate portal advert, inspect photo moderation, or guarantee the agency/agent remains connected between capture and submission. Those checks still run at the integration boundary and can return channel errors. Private Property also applies subjective description/photo moderation. There is no evidence here that either portal promises instantaneous publication.

The local forward migration `20261010111500_website_listing_public_price_terms.sql` adds explicit sale POA support to both own and partner website publication and carries rental cadence into new/updated snapshots. Existing website snapshots need a channel update to refresh their public terms; the migration does not silently republish existing stock. Provider processing time and live publication latency have not been measured in this local audit. No live listings, paid deeds requests, remote data changes or deployments were performed.

## Local verification

- `npm run check:app`: lint completed with no errors (existing warnings remain), baseline tests and production build passed.
- `npm run check:website`: website tests, type checking and production build passed. The final website test run includes 39 passing tests.
- Focused Vitest coverage: channel field rules, initial publication, rental creation UI/recovery, rental saving, portal blockers and field mapping. Tests include all seven mapped categories, portal requests running independently, no duplicate creation, no landlord/mandate prerequisites, scoped website preparation and immediate address/marketing guidance.
- Existing Node contracts passed for category models, specialist mappings, commercial facts/readiness, rental backend/API publication, Private Property preview, listing save recovery and rental data capture.
- `node --test the-it-guy/server/tests/websiteListingPriceTerms.test.js` (from repository root): executes the actual own/partner website functions and new migration in local PostgreSQL/PGlite; verifies POA, all five rental cadences, missing-price rejection, media and organisation checks, and service-only commit permissions.


## Listing performance follow-up — 10 October 2026

Verified local changes in the primary workspace/shared portal code:

- Property24 prepared photos serially before sending the payload. It now prepares two at a time for sale and rental submissions, with at most two raw-image preparations in flight. The cover/gallery order determines the total byte budget even if a later photo downloads first. Existing image quality, original-format fallback, size limits and failure reporting remain in place.
- Each initial channel completion dispatched a full listing refresh, potentially repeating rental overview, media, status and sales offer reads three times. Per-channel receipts still update immediately; one full refresh follows all initial submissions. The full channel-detail refresh therefore waits for the slowest selected submission, while its faster peers' submission receipts are already visible.
- Rental list loading fetched document requirements, uploaded documents and mandate packet/version history for card/list callers. These reads are now omitted. Existing agent-list callers retain the full default. Organisation/branch/agent scope, visibility, exact-count completeness checks, canonical terms, onboarding compatibility and distribution reads are preserved.

Controlled benchmark against the pre-change implementation: **24 JPEGs with a synthetic 40 ms download delay each**, 1,002 ms before and 507 ms after; identical returned media and reports. Peak downloads changed from one to two; the number of downloads remained 24. This is a local photo-preparation benchmark, not production upload latency, conversion throughput or portal publication time. Evidence: repository-root `tmp/listing-performance-20261010/photo-benchmark.json`.

Verification: 64 focused Vitest tests passed (rental save/retry/workspace/stock, publication receipts and listing reads); nine upload-queue/storage tests and the Property24 real-listing preview, sale publish and rental publish API scripts passed. ESLint on changed implementation files reported no errors and two existing unused-function warnings. Tests cover reversed download completion, ordered byte budgets, partial photo failures, independent channel receipts and one final refresh. No live listing was sent and no hosted changes were made.

Remaining measurement: production save/upload/portal-acceptance timings and portal-confirmed-live time have not been measured. Rental lists still load full onboarding and publication data for legacy compatibility and all media for their existing consumers; further slimming needs representative hosted-data profiling. Browser upload concurrency remains bounded rather than increased indiscriminately. Private Property and website publication retain their provider/public-media processing; this change does not promise instant external publication.

## Background publishing and draft/photo recovery — 10 October 2026

Implemented in the primary Arch9 workspace, with a shared database queue and website Edge Function delegation. This replaces the browser-owned initial publication requests described above. The public website renderer is unchanged by this follow-up.

- Sales, rentals and developer creation now wait for a durable publication acknowledgement, then open the saved listing. A server worker submits selected Property24, Private Property and website channels independently. Closing the tab after acknowledgement does not abandon publication. Provider acceptance remains distinct from a confirmed live advert.
- Initial requests are idempotent per listing/channel. Claim tokens prevent competing workers from sending the same queued job. A one-minute recovery cron picks up queued work; stale pre-dispatch claims can resume. Interrupted provider calls become **uncertain**, with no automatic resend that could create duplicate adverts. Failed/uncertain submissions require the existing Channels review/update action.
- Queue requests use the signed-in actor; the worker resolves that stored actor afresh and rechecks organisation access and active listing state. Website delegation is service-only, bound to a particular listing, job and claim. Browser readers can see receipts but not claim tokens or insert/update jobs directly.
- Creation forms automatically save text and original photo files in this browser. Recovery keeps photo order, cover selection and the listing identity, scoped to user/workspace/type. Drafts expire after seven days. Storage failures show a warning; a failed recovery read cannot overwrite the previous photo copy. Clearing browser data or using another device does not recover an unsaved browser draft.
- Sales and developer inserts now use the same reserved-identity protection as rental creation. A lost insert response retries the original record. Synchronous identity receipts take precedence over an older photo transaction when reopening. Existing compatible sale/developer text drafts migrate to the new workspace-scoped key.
- Desktop developer creation and Save Draft now retain the development/unit classification and persist marketing/photos through the same verified path as mobile creation. Private Property permits an active developer member to publish their assigned/created development-unit listing, retaining ownership checks.
- Activity receipts include queue-wait and worker-processing milliseconds. These are instrumentation for future measurements, not a measured production speed improvement.

Release dependencies, not yet applied: migration `20261010135448_listing_background_publication_jobs.sql`, both website publication Edge Functions, and the primary app/API deployment together. The worker requires existing server-only Supabase/provider configuration, an anon key for authenticated enqueue, and `CRON_SECRET` for the configured cron. The Vite development middleware also exposes the same enqueue handler. Apply the migration and Edge Functions before exposing the new frontend. No live publishing, hosted migration or deployment was performed in this task.

Verification includes executable local PostgreSQL queue/RLS/claim tests, API acknowledgement tests, worker outcome and actor tests, original-file IndexedDB tests, creation/retry handlers, rental UI tests, and website function type/security checks. A Chromium reload check restored the original photo bytes, cover and listing identity for sales, rentals and developer drafts. The final `npm run check:app` passed: lint had no errors (existing warnings remain), baseline tests passed, and the production build passed. Evidence is recorded in `tmp/listing-durable-recovery-20261010/check-app-final.log` at repository root.

Not included in this delivery: uploading photos before submission, further Private Property query consolidation, cross-device recovery of unsaved drafts, or a production latency benchmark.

## Diagnostic repair baseline — 11 October 2026

Phase 1 establishes repeatable checks for the repair programme; it changes no
listing behaviour. The primary application owns the checks. The complete
18-finding register is
[`scripts/fixtures/listing-diagnostic/findings.json`](../scripts/fixtures/listing-diagnostic/findings.json).
Each entry has a stable ID, affected scope, reproducer, acceptance criterion and
an explicit automated/manual verification classification. UX-06 through UX-11
have browser/usability/performance procedures; they are not automated passes.

Run from the repository root:

```sh
# Fast API/schema baseline: no network requests or provider credentials.
npm --prefix the-it-guy run test:listing-diagnostic -- --baseline

# Include actual sales/rental forms in an isolated Chromium fixture.
npm --prefix the-it-guy run test:listing-diagnostic -- --baseline --browser

# Desired behaviour gate: deliberately exits nonzero while defects remain.
npm --prefix the-it-guy run test:listing-diagnostic -- --browser
```

Prerequisites: the primary app dependencies, Node 22 (repository target), Python 3,
`xmllint`, and Google Chrome for the optional browser run. The authoring environment
used Node 24.11.1; this does not certify the Node 22 release runtime. The browser
fixture uses loopback port 4241, refuses port fallback, disables project Vite
configuration/environment loading, blocks browser requests outside loopback,
and substitutes storage/provider/account services. Rental persistence uses the
existing isolated PostgreSQL fixture. Sales persistence is simulated; UX-03
inspects the real form's outgoing save requests, not hosted SQL. Do not point
this fixture at a production app or replace its stubs with real credentials.

The initial baseline is **108 contract/worker checks: 65 passing and 43 known
failures**, plus **40 browser assertions reproducing known failures**, with no
browser setup errors. These are repeated category checks, not 83 distinct bugs.
`--baseline` returns success only when the reviewed baseline is reproduced; it
does **not** mean the product is ready to release. Unexpected failures, missing
checks and newly passing known failures all require review and return nonzero.
After a fix, verify the intended outcome, then remove only its resolved names
from the failure lists; retain the test inventory. Never regenerate the baseline
to hide failures. The intentional failing cases use an explicit `.cases.mjs`
entry point, so ordinary test discovery does not import them accidentally. Default mode continues to fail while any desired outcome fails.

The runner writes results and a **28-row category × transaction × portal matrix**
to repository-root `output/playwright/listing-diagnostic/`. That matrix separates
local readiness from independently checked vendor structure and leaves live
acceptance explicitly unverified. Snapshots of official P24 v55 OpenAPI and PP
production WSDL include hashes and retrieval details in `sources.json`; a changed
snapshot fails the baseline until its provenance is reviewed. Python checks P24
required fields, types, enums, names, nullability and date-time shape, not every
OpenAPI/business constraint. `xmllint` checks the full extracted PP XSD. Negative
controls establish that the validators reject invalid input. Moving only the
rent-frequency XML element in control copies resolves all seven rental XSD
failures; application serialization remains unchanged.

Existing focused protection checks were rerun separately: 35 form/save/field-rule
Vitest checks and five publication-worker/local-persistence Node checks passed.
The earlier broad diagnostic's two Vitest and 44 Node failures remain historical,
untriaged evidence; this focused baseline does not reclassify them or certify the
whole application. Raw runs remain in
`output/playwright/listing-matrix-20261011/phase-1/` at repository root.

Two external verification items remain open:

- The official P24 index still advertises v55 as its newest Listing Service,
  and the downloaded schema is unchanged. The authenticated property-type
  catalogue and agency entitlements remain unverified: the public GET returns
  401, and the local app configuration has no P24 basic-auth credentials. Existing
  synthetic catalogue IDs are test inputs, not authenticated evidence.
- The current PP production WSDL was retrieved again and is unchanged. The
  available partner document records revision 4.7 dated 20 July 2026, with a stale
  4.6 cover. [PP distributes the document through feed support](https://helpdesk.privateproperty.co.za/portal/en/kb/articles/getting-started-with-a-feed-integration);
  a newer distributed revision has not been confirmed. No support email was sent.

Complete those external checks with the agency's configured integration before
claiming current catalogue/entitlement coverage or live portal certification.
The browser probe covers offered rental creation categories; mixed-use creation
is tested as missing, not bypassed and counted as working. Its portal payloads are
still included in the 28-row matrix. Full hosted create/edit/readback, all remaining
subtypes and optional combinations, observed novice usability and production
speed measurements remain acceptance work for the later phases.


### Phase 2 repair — 11 October 2026

The primary app now keeps rental Continue separate from final submission, accepts
fractional bathrooms and areas without removing decimal points, saves specialist
sale values through the guarded seller command and checks their saved copies,
and preserves rental/deposit cents in the Property24 adapter. Specialist blanks
and false values can deliberately clear saved answers. Confirmed seller receipts
advance the editor's revision, including when a later step needs a retry.

`npm run test:listing-diagnostic -- --baseline --browser` now runs 175 checks:
132 pass, 43 reproduce the reviewed remaining defects, and none are unexpected
or missing. The four repaired findings are UX-01, UX-02, UX-03 and API-07; all 40
original regression cases for them now pass. The 27 added checks cover repeated
saves, reopening, explicit final rental submission, readback mismatches, supported
rental frequencies and outgoing general area/bathroom precision. The strict
(non-baseline) diagnostic remains red until the later-phase defects are repaired.

Focused verification also passed 95 Vitest form/service cases and 49 Node
SQL/worker cases. Sales browser storage is simulated with the real canonical
projection and a revision check; a separate migrated PGlite test covers specialist
save/readback/clearing and stale rejection across all seven categories. Rental
browser saves execute the real SQL; provider responses remain simulated.

Property24's whole-square-metre commercial specialist restriction remains enforced.
Fractional specialist values are retained without rounding; a blocked commercial
GLA needs the API/workflow phase's explanation or mapping decision. General floor
and land areas retain decimals in both portal payloads.

See `../../output/playwright/listing-matrix-20261011/report.html` and its
`phase-2/status.json` for current build results, remaining checks and evidence.
Nothing was deployed, applied to hosted data or published. This repair uses the
existing seller-save guard migrations; the coordinated frontend/database release
and hosted/provider readback remain separate, explicitly approved work.

## Diagnostic Phase 3 repairs — 11 October 2026

The primary workspace now repairs API-01, API-02, API-03, API-04 and API-06 from
[the consolidated diagnostic](../../output/playwright/listing-matrix-20261011/report.html).
This is local implementation; no listings were published or hosted data changed.

- Private Property rental XML places `RentalPriceType` after `HideUnitNumber`, as
  required by the production WSDL. Independent XSD checks cover all seven
  categories, monthly/weekly/daily rent, and permitted per-square-metre pricing.
  Annual rent remains blocked for PP.
- PP sales send `SalesPricePresentation=Poa` when POA is selected. The sales
  Review label and provider preview summary also identify POA. A retained
  asking price is hidden by that presentation. A missing/non-positive asking
  price is blocked with plain-English guidance rather than inventing a price:
  Rev 4.7 says POA ignores Price but also requires Price greater than zero. The
  existing R10,000 sale minimum remains. Zero-price POA needs vendor confirmation.
- PP office, retail, distribution-centre, industrial-park, shopping-centre and
  agricultural-land aliases use their supported meanings. P24 penthouses use
  the existing Apartment / Flat type. The report enumerates 59 category/type
  choices across both transactions. A vacant stand under Residential remains
  the existing UX-05 category-choice issue; choose Vacant Land instead.
- The form and PP mapper share title checks for contact details, website
  addresses, unsupported punctuation and the 200-character limit. Correction
  links target the title field. These requirements apply only to selected PP
  publication, leaving P24 and website requirements independent.
- Publication jobs no longer replace the saved P24 expiry with today plus 90
  days. Provider plans resolve the current saved date at dispatch. Explicit API
  dates remain explicit; the environment default is a fallback only when no date
  is saved. Expired or malformed saved dates remain blocked, including delayed
  jobs. PP's deprecated `ExpiryDate` does not control removal from PP.

Verification: the combined diagnostic has **182 checks: 171 pass, 11 reviewed
later-phase failures, no unexpected failures or missing checks**. All 32 original
Phase 3 assertions now pass; seven additional grouped checks exercise contract
edge cases. The 64 browser checks retain 57 passes and seven known category-choice
failures. Focused form tests pass (42). Publishing checks pass (14), with one
unrelated legacy source-text check still expecting “Add manual/live link” in the
unchanged listing-detail page. See the report's Phase 3 status for the app check
and exact evidence, rather than treating the baseline as a green release gate.

The current P24 v55 JSON and PP production WSDL were downloaded again and match
the recorded hashes. Latest PP partner prose revision, current authenticated P24
catalogue/agency entitlements and actual hosted/provider readback remain open.
Commercial P24 GLA still requires whole square metres; general area decimals and
saved specialist values remain unchanged. API-05 image-change detection belongs
to the later performance phase.


## Phase 4 — simpler listing capture and review (11 October 2026)

Implemented in the primary Arch9 workspace, covering UX-04 through UX-10:

- Mixed-use rental creation is available without a seeded or existing record.
  Sales category changes keep only compatible property types, including a
  separate vacant-land category without prominent room controls.
- Rental counters show unanswered values as blank, allow explicit studio/zero
  bedrooms, and accept half bathrooms. Both zero and 1.5 bathrooms are checked
  through the real local SQL save and editor readback.
- Advertising websites can be chosen at the start. Their requirements appear
  when leaving each relevant step. Correction buttons name the field, open
  collapsed details, focus the control and keep one issue visible until fixed.
- Optional feature groups have clear skip guidance and no unanswered-question
  totals. Specialist sale fields no longer show misleading required asterisks;
  measurement units remain visible after entry.
- Shared review sections show readable property types, full descriptions,
  measurements, rent frequency, price/deposit, and public-address settings.
  Editing a review section returns to its capture step.
- Rental edits say Check & save and Save rental changes. They continue to save
  without queuing portal updates, and the saved listing carries a dismissible
  notice explaining that adverts need a separate update. Creation says Save
  and publish when destinations are selected, or Save listing when none are.

Verification and exact counts are recorded in the consolidated report's
`phase-4/status.json`, including the 105-check browser matrix and focused form
checks. The diagnostic baseline was reviewed: all seven remaining category
failures passed before removal from the expected-failure list. The visible
land-area labels were renamed, and vacant-land room-entry assertions were
replaced with a room-absence check; contract tests still cover area decimals
in all categories. No new failures were accepted into the baseline.

This is local implementation, with simulated accounts, storage and provider
responses; rental saves use real isolated SQL. No deployment, hosted write or
live advert was performed. First-time-agent usability sessions and hosted/
provider readback remain pending. Phase 5 retains editor loading (UX-11) and
unnecessary photo transfer (API-05).

## Phase 5 — editor loading and unchanged photos (11 October 2026)

Implemented locally in the primary workspace. The sales editor now loads only
its selected listing and assignment/branch choices. It does not fetch the stock
list, participant transactions or per-card website statuses. Development choices
load only for a development workflow. The selected listing's website status
remains necessary to retain the correct advertising selections. Unchanged edit
steps skip repeat saves; changed steps still use the guarded save and readback,
and the final save/publish action remains explicit.

In the isolated before/after comparison, a new editor with 10 properties made
17 instrumented workspace/inventory calls before and 2 after. With 1,000
properties it made 1,007 before and 2 after. This counts the instrumented data
services, not every browser asset or authentication request. Cold/warm Vite
observations are recorded separately and are not production latency measurements.
The large shared application bundles remain a profiling concern; this change
removes unnecessary data work without claiming a complete bundle rewrite.

Queued P24 and PP jobs now ask for automatic photo comparison. Provider plans
compare the current gallery with the last successfully submitted gallery for the
same destination, environment and advert identity. The fingerprint covers source
objects, order, cover, captions and relevant media metadata. Uploaded object paths
are unique; renewed signed URLs and recreated database row IDs do not imply a new
photo. Changed/replaced galleries and missing, legacy or failed receipts resend.
Fingerprints are stored in existing sync-summary JSON after provider acceptance;
Phase 5 requires no database migration. Older adverts send their gallery once to
establish this evidence. An explicit forced P24 transfer remains supported.

Unchanged P24 photos are `null`, and their bytes are neither downloaded nor
converted. PP uses `PhotoUrls xsi:nil="true"`, so it does not receive image URLs
again. Removing every photo is blocked rather than silently sending an empty
replacement gallery. Synthetic P24 payloads with three 1 MiB photos fell from
about 4.2 MB to around 1 KB; PP fixture XML omitted all three photo URLs. Provider
processing time and actual image readback still need authorised live checks.

Evidence and the current verification results are in
`output/playwright/listing-matrix-20261011/phase-5/` at the repository root. The
combined report preserves the original failures as history and distinguishes
local implementation from release acceptance. No deployment, remote data write
or actual advert submission was performed. Phase 6 still includes hosted save /
portal readback, production device/network timing and first-time-agent sessions.

Final local verification: 237/237 diagnostic checks (119 contract/provider and
118 browser), 36 photo/worker tests, five existing provider/API script groups and
19 focused save/recovery/keyboard/channel tests pass.
`KNOWLEDGE_FACTORY_RUN_LOGIN_PROBE=false npm run check:app` passes lint (zero
errors, 615 existing workspace warnings), all nine baseline groups and the
production build (1m 24s). Existing bundle/circular-import warnings and the
Node 24 local versus Node 22 release difference remain recorded in the report.

## Phase 6 — acceptance and release verification (11 October 2026)

The existing diagnostic now supports a repeatable constrained mobile run:

```sh
npm --prefix the-it-guy run test:listing-diagnostic -- --baseline --browser --profile=mobile-slow
```

It runs the same complete category/transaction checks at 390 × 844 with touch,
four-times CPU slowdown and 200 ms added to each browser fixture data request.
It retains the loopback-only network boundary. Vite assets are not throttled:
these are functional checks under slower conditions, not production load-time
benchmarks or a substitute for a physical phone. Profile settings and the number
of delayed requests are saved with the results. Mobile evidence has its own
output directory so it cannot replace the ordinary desktop run.

The consolidated report's `phase-6/` directory contains current results, a
28-row portal acceptance checklist (seven categories × sale/rental × two
portals), a 14-row hosted save checklist, a source comparison and the remaining
human checks. Empty or pending evidence is never a passed acceptance check.

Read-only production inspection found release
`61d3d64c656d8bf063162182ec8b41c3d27dee58`: its shell/manifest markers agree and
all 857 manifest assets return the expected content types. The deployment's
recorded commit differs from the local listing changes, including the photo
comparison service. This metadata comparison is not proof of exact CLI-uploaded
server bytes. A matching, scoped deployment must be established before live
acceptance can certify these fixes. The current Vercel project reports Node
24.x; earlier phase notes about a Node 22 target are historical, not the current
project setting.

### Hosted acceptance procedure

After explicit approval for the target deployment and disposable test records:

1. Record the immutable deployment ID, release marker, scoped source hashes,
   database prerequisites, test agency/agent and recovery version. Preserve
   unrelated checkout changes. Follow the database release runbook if any
   required schema correction is absent; do not apply all pending migrations.
2. In every category and transaction combination, create a disposable listing
   with realistic, authorised location/agency data. Confirm Continue does not
   publish; inspect review, save, reload in a fresh session, edit and clear optional
   specialist values, then compare the server readback. Exercise decimals, studio
   zero, units, price/POA, rental cadence/deposit and public-address privacy.
3. Verify actual Storage upload/download, cover and image order; retry a failed
   upload and save without duplicates. Verify a second authorised agent's access
   and rejection of an unauthorised organisation. Do not use service-role access
   as evidence of ordinary agent permissions.
4. For all 28 portal combinations, record authenticated category/subtype IDs and
   agency/agent entitlement, exact submitted fields, job receipt and provider
   readback. Inspect the resulting advert and images. An HTTP success or queued
   job alone is insufficient. Confirm unsupported combinations are explained
   before publication instead of forcing a mismatched category.
5. Edit text/price without changing photos; verify the existing gallery survives
   on the portal. Change cover/order and replace a photo; verify the new gallery.
   Exercise failed-channel-only retry and uncertain-status readback without
   duplicate adverts. Verify expiry/withdrawal and record cleanup. Also verify
   the agency website when it is a selected destination.
6. Record the current authenticated P24 catalogue and entitlements, and obtain
   PP's confirmation of the current partner document. Public OpenAPI/WSDL
   validation cannot replace these checks. Contacting providers needs a separate
   instruction to send the prepared request.

For each case, retain redacted expected/actual values, listing and provider IDs,
timestamps, deployment identity and evidence locations in the checklist. Keep
tokens, credentials and personal seller information out of the report. Failed
or unsupported cases need a recorded resolution and a repeated check.

### Speed and first-time-agent acceptance

On the matching hosted release, measure cold and warm editor readiness, save
acknowledgement, upload progress and time from queued publication to portal
readback separately. Use desktop and a real modest Android phone, plus a
reproducible 1.6 Mbps / 150 ms latency / 4× CPU browser profile. Take at least
three samples per condition; retain raw samples and report the median and range.
Do not include a human's typing time in system latency or infer provider time
from local payload size. Record portfolio size, browser/device and connection.
Investigate shared bundle cost if the editor still loads slowly.

Observe at least three agents who have not used the revised journey. Across
their sessions cover sales, rentals and each property category. Give them the
property facts and desired result, without telling them which buttons to press:

- Create a listing, skip unnecessary extras and choose where it should appear.
- Correct an incorrect price or size from review and explain which address
  details will be public.
- Save or publish, then reopen and update it; explain when changes reach adverts.
- Recover from a missing required field or failed upload.

Record task completion, time, mistakes, help requested and words that caused
hesitation. Use anonymous participant codes. Accept the wording only when
participants can complete the tasks without coaching and correctly distinguish
saving from publishing. Fix critical misunderstandings and repeat the affected
tasks. Automated clicks do not count as human usability evidence.

The implementation and local checks can be completed independently, but Phase 6
acceptance remains open until the matching hosted release, provider readback,
production measurements and observed sessions have evidence. No deployment,
remote test record, provider submission or provider message is authorised merely
by the existence of this checklist.

Final local results: **237/237 checks pass in each profile**, desktop and
constrained mobile, with no known/unexpected failures or missing checks. Mobile
exercised 240 delayed data requests. All 42 assertions in the current supplemental
seller-save script pass. The slow profile exposed a diagnostic receipt race:
Reopen editor defaulted to sales before the saved record arrived. The fixture
now waits for the record. Initial unsuccessful runs remain as historical
evidence. No application runtime change or new migration was needed in Phase 6.
