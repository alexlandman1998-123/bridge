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
