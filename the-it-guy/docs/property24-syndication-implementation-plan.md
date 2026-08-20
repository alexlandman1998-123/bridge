# Property24 Syndication Implementation Plan

Date: 2026-08-20

## Plain-English Summary

Property24 syndication means Arch9 must become the source system for a listing and push that listing to Property24 through their REST API. Property24 then returns its own `listingNumber`, portal visibility result, and validation reasons. Arch9 must store those results, keep future edits in sync, and reconcile Property24's status changes back into Arch9.

The login details supplied by Property24 are API Basic Auth credentials for the ExDev sandbox. They are used in Swagger's `Authorize` button, Postman/cURL, or a backend HTTP client. They must not be placed in frontend JavaScript or committed to the repo.

Primary API for this build:

- Base URL: `https://api.exdev.property24-test.com`
- Main service: `Listing Service v53`
- Main create/update endpoint: `POST /listing/v53/listings`
- Main status endpoint: `PUT /listing/v53/listings/{listingNumber}/status`
- ExDev agency id supplied by Property24: `31382`
- Optional/possibly required request header: `P24-UserGroupId`. Do not assume this is the agency id; using `31382` caused a 401 in ExDev. Only set it when Property24 supplies the correct User Group ID.

Supporting services are useful later, but they are not the first build:

- `Development Service v11`: only needed for developer/new-development syndication.
- `Location Service v1`: useful for more robust location catalog sync.
- `Search Integration Service v1`: useful if Arch9 consumes Property24 search/listing data, not for the first push-to-Property24 path.

## Immediate Security Action

The ExDev password has been pasted into a chat/task context. Treat it as exposed. For ExDev this is survivable, but before production go-live:

- Ask Property24 for fresh live credentials.
- Store credentials only as server-side environment variables.
- Never send Basic Auth credentials from the browser.
- Keep ExDev and Live credentials separate.

Recommended env names:

```text
PROPERTY24_BASE_URL=https://api.exdev.property24-test.com
PROPERTY24_BASIC_AUTH_USERNAME=...
PROPERTY24_BASIC_AUTH_PASSWORD=...
PROPERTY24_DEFAULT_AGENCY_ID=31382
PROPERTY24_USER_GROUP_ID=
PROPERTY24_DEFAULT_AGENT_ID=77959
PROPERTY24_DEFAULT_AGENT_SOURCE_REFERENCE=ARCH9-AGENT-001
PROPERTY24_DEFAULT_SUBURB_ID=5864
PROPERTY24_DEFAULT_PROPERTY_TYPE_ID=4
PROPERTY24_DEFAULT_EXPIRY_DATE=2026-12-31
PROPERTY24_ENVIRONMENT=exdev
PROPERTY24_SYNDICATION_ENABLED=false
```

## Current Arch9 Fit

Arch9 already has most of the internal listing foundation:

- `private_listings`: operational listing shell and lifecycle.
- `listing_publication_data`: public marketing data, including price, bedrooms, bathrooms, sizes, description, status.
- `listing_media`: listing images, floor plans, videos, virtual tours.
- `listing_external_links`: external portal links/status.
- `private_listings.property24_status`, `property24_reference`, `property24_listing_url`: existing Property24-facing placeholders.

The missing piece is a reliable external sync layer: credentials, catalog mapping, Property24 payload generation, queueing, retries, audit logs, reconciliation, and vetting evidence.

## Core API Layer Split

Implemented on 2026-08-20:

- `server/property24/client.js`: Property24 HTTP client export, including listing publish, status, leads, and statistics endpoints.
- `server/property24/mapper.js`: Arch9-to-Property24 payload mapper export.
- `server/property24/listingDataService.js`: Arch9 listing/publication/media loading and image-byte preparation.
- `server/property24/syncService.js`: Property24 listing number/status persistence into Arch9.
- `server/property24/publishService.js`: shared publish orchestration for preview, submit, portal check, and sync writeback.
- `server/property24/leadService.js`: Property24 lead pull adapter. This fetches leads from Property24 but does not yet convert them into Arch9 CRM leads.
- `server/property24/apiContract.js`: API paths under `/api/property24`, separate from the normal Arch9 listing API.
- `server/property24/api.js`: protected backend route layer for preview, publish, status, and lead pull actions.

The existing terminal scripts now call the separate Property24 module instead of owning the integration logic directly. Future UI/API work should import from `server/property24`, not from generic listing services.

Implemented internal API routes:

- `POST /api/property24/listings/:listingId/preview`
- `POST /api/property24/listings/:listingId/publish`
- `GET /api/property24/listings/:listingId/status`
- `GET /api/property24/listings/:listingId/leads`
- `POST /api/property24/leads/pull`

These routes require `PROPERTY24_API_INTERNAL_TOKEN` unless `PROPERTY24_API_ALLOW_UNAUTHENTICATED_LOCAL=true` is set for local testing. The publish and bulk lead-pull routes also require `PROPERTY24_SYNDICATION_ENABLED=true`.

Implemented verification:

```text
npm run test:property24-api-layer
```

Lead pull is intentionally fetch-only in this phase. It summarizes and returns Property24 lead data, but does not yet create Arch9 CRM leads. Lead dedupe, matching, and persistence belong in the later lead-ingestion phase.

## Phase 0: Access, Smoke Tests, And API Contract

Goal: prove the credentials work and capture the Property24 account shape before writing product code.

Implemented command:

```text
npm run property24:phase1
```

Put the ExDev values in `.env.property24.local` or another local env source that is not committed:

```text
PROPERTY24_BASIC_AUTH_USERNAME=...
PROPERTY24_BASIC_AUTH_PASSWORD=...
PROPERTY24_DEFAULT_AGENCY_ID=31382
PROPERTY24_USER_GROUP_ID=
```

The command writes a sanitized report to `outputs/property24-phase1-smoke.json`. It records pass/fail counts, HTTP status codes, and safe response summaries only. It must not record the password or Authorization header.

Build:

- A server-side `property24Client` wrapper with Basic Auth, timeout, JSON parsing, and structured errors.
- A local script or protected admin diagnostic to call:
  - `GET /listing/v53/echo`
  - `GET /listing/v53/echo-authenticated`
  - `GET /listing/v53/agencies`
  - `GET /listing/v53/agencies/31382`
  - `GET /listing/v53/agencies/31382/agents`
  - `GET /listing/v53/property-types`
  - `GET /listing/v53/listing-types`
  - `GET /listing/v53/countries`, `provinces`, `cities`, `suburbs`

Deliverables:

- Auth succeeds in ExDev.
- Agency `31382` is confirmed as the correct Property24 agency id.
- Agent ids visible to the account are recorded.
- Supported property types and listing types are cached.
- A short evidence file records request ids/timestamps, status codes, and safe response summaries.

Exit criteria:

- We can authenticate server-side.
- We know which Property24 agent ids can be assigned to listings.
- We know which catalogs must be mapped before a listing can publish.

## Phase 1: Data Model For Syndication

Goal: add durable tracking without disturbing the current listing workflow.

Add tables or equivalent columns for:

- `property24_accounts`
  - `organisation_id`
  - `agency_id`
  - `environment`
  - `enabled`
  - `last_auth_check_at`
  - no raw passwords; store only secret references or rely on env.

- `property24_agent_mappings`
  - Arch9 user/profile/agent id
  - Property24 `agentId`
  - `agencyId`
  - `sourceReference`
  - email/mobile/name snapshot
  - status and last sync metadata.

- `property24_catalog_mappings`
  - Property24 country/province/city/suburb ids.
  - Property24 property type ids.
  - Local normalized values and match confidence.

- `property24_listing_syncs`
  - `private_listing_id`
  - Property24 `listingNumber`
  - current external status
  - `is_on_portal`
  - last payload hash
  - last successful sync timestamp
  - last error/reasons
  - image payload hash
  - environment and agency id.

- `property24_sync_attempts`
  - sync job id/listing id
  - action: `create`, `update`, `status_update`, `reconcile`, `lead_import`
  - request payload snapshot with sensitive fields stripped
  - response status/body summary
  - retry count, duration, and actor.

Reuse:

- Continue writing the public portal URL/status into `listing_external_links`.
- Continue exposing summary status through `private_listings.property24_status`.

Exit criteria:

- Every Property24 mutation has an audit trail.
- Every Arch9 listing can be linked to exactly one Property24 listing number per environment.
- Retrying a failed job is idempotent.

Useful Listing Service endpoints for later phases:

- `GET /listing/v53/listings/{listingNumber}/is-on-portal`: after publishing, confirm whether Property24 is actually showing it.
- `GET /listing/v53/listings/reconciliation`: compare Arch9's stored state to Property24's state.
- `GET /listing/v53/listings/updates`: catch Property24-side changes such as blocked or expired listings.
- `GET /listing/v53/listings/leads`: import portal enquiries into Arch9.
- `GET /listing/v53/listings/statistics`: import views/leads performance stats.

## Phase 2: Readiness Gate And Payload Mapper

Goal: do not let agents publish invalid listings.

Implemented code:

- `server/services/property24ListingMapper.js`
- `npm run test:property24-phase2`

This phase is intentionally non-mutating. It does not call Property24 and does not publish a listing. It translates Arch9 listing/publication/media inputs into a Property24 payload only when all required fields are present.

The mapper separates:

- `dataBlockers`: things the listing/user must fix, such as missing Property24 agent id, suburb id, description, expiry date, price/POA, or image.
- `technicalBlockers`: things the backend worker must solve before final submit, such as loading image bytes from existing `listing_media` URLs.

Create a `buildProperty24ListingPayload(privateListingId)` service that reads:

- `private_listings`
- `listing_publication_data`
- `listing_media`
- assigned agent/profile data
- catalog mappings
- mandate/publication readiness state

Minimum Property24 payload fields:

- `agencyId`
- `contactAgentIds`
- `listingType`: `Sale` or `Rental`
- `status`
- `price` and `isPOA`
- `listingVisibility`: normally `Public`
- `expiryDate`
- `description`
- `photos`
- `propertyInfo.suburbId`
- `propertyInfo.propertyTypeId`
- `propertyFeatures` required booleans/enums where applicable.

Important API behavior:

- For a new listing, do not send `listingNumber`.
- For an update, send the existing Property24 `listingNumber`.
- New listings need at least one image.
- For updates where images did not change, send `photos: null`.
- Sending `photos: []` means remove all photos.
- Agent `sourceReference` is mandatory for listing agents.
- Show-day duration cannot exceed 24 hours.

Readiness blockers should include:

- Property24 account not configured.
- Missing mapped Property24 agency id.
- Missing mapped Property24 agent id/source reference.
- Missing Property24 suburb id.
- Missing Property24 property type id.
- Missing description.
- Missing expiry date.
- Missing image for first publish.
- Missing signed mandate/publication approval gate.
- Unsupported listing type/property type combination.

Exit criteria:

- The UI can show "Ready for Property24" or exact blockers.
- Payload generation is pure/testable and does not call the API.
- Unit tests cover sale, rental, missing catalog, missing image, image unchanged update, and status-only update.

Safe code-only mock preview:

```text
npm run property24:phase3:mock
```

This uses fake listing data in code only. It does not call Property24, does not write to Supabase, and does not publish anything.

Expected safe behavior:

- Without a Property24 suburb id, the mock report blocks with `missing_property24_suburb_id`.
- With a supplied suburb id, it can produce a preview payload:

```text
npm run property24:phase3:mock -- --suburb-id=<property24-suburb-id>
```

- It still blocks final submit with `listing_image_bytes_not_loaded_for_property24_submit` until the later backend worker loads image bytes from the listing media URL.

Safe suburb lookup:

```text
npm run property24:find-suburb -- --country="South Africa" --province=Gauteng --city=Johannesburg --suburb=Sandton
```

This calls Property24 ExDev and writes a sanitized report to `outputs/property24-find-suburb.json`. Use the returned `suburbId` in the mock preview command above. It does not create listings and does not publish anything.

Safe real Arch9 listing preview:

```text
npm run property24:preview-listing -- --list-candidates

npm run property24:preview-listing -- --listing-id=<arch9-private-listing-id> --agent-id=77959 --agent-source-reference=ARCH9-AGENT-001 --suburb-id=5864 --property-type-id=4 --expiry-date=2026-12-31

npm run property24:preview-listing -- --listing-id=<arch9-private-listing-id> --agent-id=77959 --agent-source-reference=ARCH9-AGENT-001 --suburb-id=5864 --property-type-id=4 --expiry-date=2026-12-31 --load-image-bytes
```

The first command lists recent Arch9 listing IDs. The second reads `private_listings`, `listing_publication_data`, and `listing_media`, then generates a Property24 preview report at `outputs/property24-real-listing-preview.json`. The third does the same thing but also downloads image files into temporary Property24 bytes for the local preview. It does not call Property24 and does not write to Supabase.

Guarded ExDev publish command:

```text
npm run property24:publish-listing -- --listing-id=<arch9-private-listing-id> --agent-id=77959 --agent-source-reference=ARCH9-AGENT-001 --suburb-id=<property24-suburb-id> --property-type-id=4 --expiry-date=2026-12-31

npm run property24:publish-listing -- --listing-id=<arch9-private-listing-id> --agent-id=77959 --agent-source-reference=ARCH9-AGENT-001 --suburb-id=<property24-suburb-id> --property-type-id=4 --expiry-date=2026-12-31 --apply
```

The first command is a dry run and writes `outputs/property24-publish-listing.json` with image bytes redacted. The second command is the first actual ExDev write to Property24. It still does not write back to Supabase; storing the returned Property24 listing number is a later controlled step after the first API response is understood.

## Phase 3: Agent And Catalog Synchronisation

Goal: remove manual lookup errors.

Implemented code:

- `server/property24/synchronisationService.js`
- `scripts/property24-sync-preview.mjs`
- `sql/20260820_property24_agent_catalog_mappings.sql`
- `supabase/migrations/202608200002_property24_agent_catalog_mappings.sql`
- `npm run test:property24-phase3-sync`

Implemented command:

```text
npm run property24:sync-preview -- --organisation-id=<arch9-organisation-id> --country-id=1 --province-id=<property24-province-id> --city-id=<property24-city-id>
```

This command reads Arch9 active organisation users, fetches Property24 agents/catalogs, and writes a redacted report to `outputs/property24-sync-preview.json`. It does not create agents, does not update mappings, and does not publish listings.

The sync preview now supports:

- Catalog refresh job for country/province/city/suburb/property/listing types.
- Agent discovery from `GET /listing/v53/agencies/{agencyId}/agents`.
- Agent mapping by email first, then explicit admin selection.
- Optional create/update agent flows if Property24 permissions allow:
  - `POST /listing/v53/agents`
  - `PUT /listing/v53/agents`
  - `PUT /listing/v53/agents/{agentId}/profile-picture`

The database migration defines:

- `property24_accounts`
- `property24_agent_mappings`
- `property24_catalog_mappings`

These tables are service-role managed and have RLS enabled with no public mutation policy.

Admin UI requirements:

- Show connected agency.
- Show Property24 agents and mapped Arch9 agents.
- Show unmapped Arch9 agents.
- Allow admin to set/confirm `sourceReference`.
- Show catalog mapping exceptions.

Exit criteria:

- A listing can resolve its Property24 `contactAgentIds` without guessing.
- Suburb and property type mappings are reviewable.
- No publish action proceeds with ambiguous agent/location mapping.

## Phase 4: Controlled Publish And Update Workflow

Goal: publish one listing end-to-end, safely.

Implemented code:

- `server/property24/workflowService.js`
- `scripts/property24-status-update.mjs`
- `sql/20260820_property24_sync_attempts.sql`
- `supabase/migrations/20260820114528_property24_sync_attempts.sql`
- `POST /api/property24/listings/:listingId/status-update`
- `npm run test:property24-phase4-workflow`

Implemented command:

```text
npm run property24:publish-listing -- --listing-id=<arch9-private-listing-id> --agent-id=<property24-agent-id> --agent-source-reference=<source-reference> --suburb-id=<property24-suburb-id> --property-type-id=<property24-property-type-id> --expiry-date=<yyyy-mm-dd> --apply

npm run property24:publish-listing -- --listing-id=<arch9-private-listing-id> --listing-number=<property24-listing-number> --agent-id=<property24-agent-id> --agent-source-reference=<source-reference> --suburb-id=<property24-suburb-id> --property-type-id=<property24-property-type-id> --expiry-date=<yyyy-mm-dd> --photos-unchanged --apply

npm run property24:status-update -- --listing-id=<arch9-private-listing-id> --listing-number=<property24-listing-number> --status=Withdrawn --apply
```

The first command creates or updates a full listing through the controlled workflow. The second updates copy/price/details while sending `photos: null`, which avoids resending image bytes. The third changes only the listing status through Property24's status endpoint.

Every apply run now writes a `property24_sync_attempts` audit row with:

- action: `create`, `update`, or `status_update`
- idempotency key
- redacted request summary
- response/error summary
- payload hash and image payload hash
- duration and HTTP status where available

The existing `property24_listing_syncs` table is extended with `last_payload_hash` and `last_image_payload_hash`.

Workflow:

1. Agent/Admin opens listing.
2. System runs Property24 readiness gate.
3. User clicks `Publish to Property24`.
4. Backend creates a `property24_sync_attempts` job.
5. Worker/server function posts to `POST /listing/v53/listings`.
6. Response stores:
   - `listingNumber`
   - `isOnPortal`
   - blocking reasons
   - last successful payload hash
7. Arch9 updates:
   - `property24_listing_syncs`
   - `private_listings.property24_status`
   - `private_listings.property24_reference`
   - `listing_external_links` for Property24.

Status-only changes:

- Use `PUT /listing/v53/listings/{listingNumber}/status` for withdrawn, back-on-market, pending, sold, expired, and similar changes where the full payload is unnecessary.

Full updates:

- Use `POST /listing/v53/listings` with the existing `listingNumber`.
- Only include image bytes when images changed.

UI states:

- `not_configured`
- `not_ready`
- `ready`
- `publishing`
- `published`
- `published_not_on_portal`
- `failed`
- `removed`
- `needs_reconciliation`

Exit criteria:

- One ExDev listing can be created from Arch9.
- Updating copy/price does not resend image bytes.
- Updating images intentionally replaces/removes images only when requested.
- Status changes sync without resending the full listing.

## Phase 5: Reconciliation, Leads, And Statistics

Goal: keep Arch9 truthful after the initial publish.

Status: implemented as a report-only operations layer.

Implemented files:

- `server/property24/reconciliationService.js`
  - Compares Arch9 `property24_listing_syncs` rows with Property24 reconciliation data.
  - Pulls recent Property24 updates with the required 7-day `fromDate` guard.
  - Optionally checks `is-on-portal` for synced listings.
  - Optionally pulls Property24 leads with the required 30-day `after` guard.
  - Normalizes leads with `source: Property24`, Arch9 listing mapping, organisation mapping where available, and a stable dedupe key.
  - Optionally fetches listing/statistics snapshots.

- `api/property24/reconciliation/run.js`
  - Internal API route for future cron/scheduled execution.
  - `POST /api/property24/reconciliation/run`

- `api/property24/leads/pull.js`
  - Existing lead route now returns a lead import plan instead of only raw Property24 lead data.

- `scripts/property24-reconcile.mjs`
  - Local/manual command for the nightly-style report.

Commands:

```bash
npm run property24:reconcile
npm run property24:reconcile -- --include-leads
npm run property24:reconcile -- --include-portal-checks
npm run property24:reconcile -- --include-statistics
npm run test:property24-phase5-reconciliation
```

Safety:

- This phase is report-only.
- It calls Property24 and reads Arch9 sync/listing rows.
- It does not publish listings.
- It does not update listing status.
- It does not create CRM leads yet.
- Lead records are prepared for CRM ingestion and marked `readyForCrmIngestion`.

Scheduled jobs:

- `GET /listing/v53/listings/reconciliation?agencyId=31382`
  - Confirms listings known to Property24.
  - Detects missing, unexpected, or status-drifted listings.

- `GET /listing/v53/listings/updates?fromDate=...`
  - Polls recent external status changes.
  - `fromDate` must stay within the past 7 days.

- `GET /listing/v53/listings/{listingNumber}/is-on-portal`
  - Confirms whether the listing is visible.

Optional, permission-dependent:

- `GET /listing/v53/listings/leads?after=...`
  - Imports up to 1000 lead messages per response.
  - `after` cannot be older than 30 days.
  - Use `nextAfter` for pagination.

- `GET /listing/v53/listings/{listingNumber}/leads`
  - Per-listing lead backfill over max 62-day windows.

- Statistics endpoints.

Lead import target:

- Route imported Property24 enquiries through the existing lead ingestion path with source `property24`.
- Link imported leads to `private_listings.id` using the stored Property24 `listingNumber`.
- Deduplicate by listing number, email/contact number, message, and timestamp.

Current implementation note:

- Lead import is prepared, mapped, and deduped, but final CRM creation remains deliberately separate.
- This avoids silently creating duplicate buyer leads until we confirm Property24's exact lead response shape and the target Arch9 CRM workflow.

Exit criteria:

- Nightly reconciliation can identify drift. Implemented.
- External blocked/expired/sold statuses do not silently diverge from Arch9. Implemented as `NEEDS_REVIEW` report output.
- Lead import is either implemented or explicitly deferred if Property24 has not granted access. Implemented as a safe import plan; CRM write remains the next controlled step.

## Phase 6: ExDev Vetting Pack

Goal: be ready when Property24 Operations asks to vet the integration.

Status: implemented as a redacted evidence pack generator.

Implemented files:

- `server/property24/vettingPackService.js`
  - Builds a single vetting checklist from the existing Property24 evidence reports.
  - Redacts credentials, tokens, signed storage URLs, and raw image bytes.
  - Proves invalid listing handling by exercising the Property24 mapper readiness gate.
  - Labels each checklist item as `PASS`, `READY`, `MANUAL_REQUIRED`, `PARTIAL_PASS`, `NEEDS_EVIDENCE`, or `NEEDS_REVIEW`.

- `scripts/property24-vetting-pack.mjs`
  - Writes `outputs/property24-vetting-pack.json`.
  - Writes `outputs/property24-vetting-pack.md`.

Commands:

```bash
npm run property24:vetting-pack
npm run test:property24-phase6-vetting-pack
```

What the pack proves automatically:

- Authenticated echo.
- Agency and agent fetch.
- Catalog fetch and mapping readiness.
- Listing preview/image readiness.
- Stored `listingNumber` reuse.
- Reconciliation result.
- Invalid listing blocker handling.
- Redacted audit summaries.
- Retry/idempotency plumbing via `property24_sync_attempts`.

What remains manual by design:

- ExDev status changes such as withdrawn, back to market, pending, and sold.
- Intentional no-image update using `--photos-unchanged`.
- Intentional image replacement/update.

Prepare evidence for:

- Authenticated echo test.
- Agency and agent fetch.
- Catalog fetch and mapping.
- Create listing with image.
- Update listing price/description without changing images.
- Update listing images.
- Set status to withdrawn.
- Set status back to market.
- Set status to pending/sold.
- Check `is-on-portal`.
- Reconciliation result.
- Error handling for a deliberately invalid listing.
- Retry/idempotency behavior for a transient failure.
- Audit log showing request/response summary without exposing credentials.

Operational notes to show Property24:

- Credentials are server-side only.
- Image updates are minimized.
- `listingNumber` is stored and reused for updates.
- Reconciliation runs on a schedule.
- Status changes use the status endpoint where appropriate.
- Failed publishes surface exact blocker/reason messages to users.

Exit criteria:

- ExDev vetting can be scheduled with confidence.
- We can demonstrate create, update, status, and reconciliation from Arch9.

## Phase 7: Live Cutover

Goal: move from ExDev to production without a messy bulk publish.

Steps:

- Request live credentials only after ExDev vetting passes.
- Rotate any exposed ExDev credentials if Property24 recommends it.
- Add separate live env vars.
- Keep `PROPERTY24_SYNDICATION_ENABLED=false` by default in live.
- Enable for one internal/test agency first.
- Publish 1-3 listings manually.
- Reconcile after each publish.
- Confirm portal visibility and lead routing.
- Then enable for the target agency.

Controls:

- Feature flag by organisation.
- Publish permission tied to `publish_listings`.
- Rate-limit sync jobs.
- Dead-letter queue for repeated failures.
- Daily reconciliation alert.
- Rollback action maps to Property24 status update, not database deletion.

Exit criteria:

- Live listing create/update/status flows work.
- Failed syncs are visible to operators.
- No bulk publishing occurs without explicit approval.

## Suggested Build Order

1. `property24Client` plus smoke-test script.
2. Data model migration for accounts, mappings, syncs, attempts.
3. Catalog and agent sync.
4. Payload mapper and readiness gate.
5. Manual publish action and worker.
6. Status update action.
7. Reconciliation job.
8. Lead import, if permitted.
9. Admin/operator dashboard.
10. ExDev vetting pack.

## Estimated Effort

Small but credible MVP:

- Access/client/smoke tests: 0.5-1 day.
- Data model and RLS/service-role access: 1-2 days.
- Catalog/agent mapping: 1-2 days.
- Payload mapper/readiness tests: 2-4 days.
- Publish/update/status worker: 2-4 days.
- Reconciliation and operator visibility: 1-3 days.
- ExDev vetting polish: 1-2 days.

Realistic total: 2-3 weeks for a careful first version.

## Do Not Build First

- Do not put Property24 calls directly in React.
- Do not bulk-publish all listings as the first test.
- Do not treat `property24_status = published` as proof the listing is visible; store/check `isOnPortal`.
- Do not overwrite all photos on every copy/price edit.
- Do not start with Development Service unless the immediate business requirement is new developments.
- Do not assume lead import access is available; the docs flag it as permission-dependent.

## MVP Success Definition

The MVP is successful when Arch9 can:

- Store Property24 API configuration safely.
- Map an Arch9 agency/agent/listing to Property24 ids.
- Show exactly why a listing is or is not publishable.
- Publish one listing to ExDev.
- Store the returned Property24 listing number.
- Update the same listing without creating a duplicate.
- Change the listing status.
- Reconcile external status back into Arch9.
- Produce a vetting evidence pack for Property24 Operations.
