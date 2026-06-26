# Arch9 Buy Listing Bridge - Phase 1 Audit

Date: 2026-06-25

## Objective

Audit the current Listings page, listing schema, and publication plumbing to confirm what is already in place for a bridge between `app.arch9.co.za` and `www.arch9.co.za/buy`.

## Current Public Website State

- `www.arch9.co.za` and `arch9.co.za` are handled by the same React application through public-aware host routing in `src/App.jsx`.
- The current Buy page is `BridgeBuyPage` in `src/pages/BridgeLanding.jsx`.
- `BridgeBuyPage` is currently a marketing/generic subpage, not a property catalogue.
- Public website routes currently use `/bridge/buy`; direct `/buy` and `/buy/:slug` routes still need to be added.

## Listing Source Of Truth

The internal app source of truth is `private_listings`.

Relevant core fields currently available:

- `id`
- `organisation_id`
- `assigned_agent_id`
- `listing_reference`
- `listing_status`
- `listing_visibility`
- `title`
- `description`
- `asking_price`
- `address_line_1`
- `address_line_2`
- `suburb`
- `city`
- `province`
- `postal_code`
- `property_type`
- `listing_category`
- `mandate_status`
- `seller_onboarding_status`
- `is_active`
- `created_at`
- `updated_at`

Important constraint:

- Current `listing_visibility` values are `internal`, `active_market`, and `archived`.
- There is no current `public` visibility value.
- Therefore Phase 2 should use `active_market` for public marketplace eligibility unless a migration adds a dedicated `public` value.

## Existing Publication Tables

The app already has listing distribution tables:

- `listing_publication_data`
- `listing_media`
- `listing_external_links`

These tables are created by:

- `supabase/migrations/202606030001_listing_distribution_workspace.sql`

### `listing_publication_data`

Stores public-facing listing copy and specs:

- `listing_id`
- `title`
- `address`
- `suburb`
- `province`
- `property_type`
- `listing_type`
- `asking_price`
- `bedrooms`
- `bathrooms`
- `garages`
- `parking_bays`
- `floor_size`
- `erf_size`
- `rates_taxes`
- `levies`
- `description`
- `features`
- `amenities`
- `status`

Allowed statuses:

- `Draft`
- `Ready`
- `Published`
- `Archived`

### `listing_media`

Stores listing media:

- `listing_id`
- `media_type`
- `file_url`
- `caption`
- `sort_order`
- `is_cover`

Allowed media types:

- `image`
- `floor_plan`
- `video`
- `virtual_tour`
- `other`

### `listing_external_links`

Stores external/public platform links:

- `listing_id`
- `platform`
- `url`
- `status`
- `published_at`
- `last_checked_at`
- `notes`
- `visible_to_seller`

## Existing Arch9 Publication Fields

`private_listings` already has Arch9-specific portal fields from:

- `supabase/migrations/202605190002_private_listing_portal_fields.sql`

Fields:

- `bridge_listing_status`
- `bridge_listing_public_url`
- `listing_preview_description`
- `internal_listing_notes`

Allowed `bridge_listing_status` values:

- `not_published`
- `draft`
- `published`
- `paused`
- `removed`

## Current Listings Page Save Flow

The internal listing detail page is:

- `src/pages/AgentListingDetail.jsx`

The key function is:

- `saveMarketingDraft`

On save, it currently:

1. Persists the core listing snapshot.
2. Updates `private_listings` via `updatePrivateListing`.
3. Writes portal fields:
   - `property24_listing_url`
   - `property24_status`
   - `private_property_listing_url`
   - `private_property_status`
   - `bridge_listing_status`
   - `bridge_listing_public_url`
   - `listing_preview_description`
   - `internal_listing_notes`
4. Calls `syncPrivateListingDistributionData`.
5. Upserts public-facing copy into `listing_publication_data`.
6. Replaces listing media rows in `listing_media`.
7. Replaces platform link rows in `listing_external_links`.

This means the internal app already has the core publication write-path required for `www.arch9.co.za/buy`.

## Remote Table Probe

Using the configured Supabase environment:

- Project host: `isdowlnollckzvltkasn.supabase.co`

Tables exist:

- `private_listings`: 78 rows
- `listing_publication_data`: 1 row
- `listing_media`: 11 rows
- `listing_external_links`: 0 rows

Publication status distribution:

- `Draft`: 1

Bridge listing status distribution:

- `not_published`: 33
- `published`: 31
- `paused`: 9
- `removed`: 5

Listing visibility distribution:

- `internal`: 33
- `active_market`: 29
- `archived`: 16

Anonymous table probe:

- Tables are reachable, but anonymous queries return 0 rows.
- This confirms the existing RLS posture is not exposing internal listing data publicly.

## Key Finding

There are many rows with `bridge_listing_status = published`, but only one row in `listing_publication_data`, and that row is still `Draft`.

Therefore, Phase 2 must not treat `bridge_listing_status = published` alone as enough to show a property publicly.

## Recommended MVP Public Eligibility Rule

A listing should appear on `www.arch9.co.za/buy` only when all of these are true:

- `private_listings.bridge_listing_status = 'published'`
- `private_listings.listing_visibility = 'active_market'`
- `listing_publication_data.status = 'Published'`
- `listing_publication_data.title` is not empty
- `listing_publication_data.asking_price` is present
- at least one `listing_media` row exists with `media_type = 'image'`

Optional but strongly recommended:

- `listing_publication_data.description` is not empty
- `listing_publication_data.suburb` or `private_listings.suburb` is present

## Gaps Before Phase 2

1. No direct `/buy` route yet.
2. No public listing catalogue component yet.
3. No public listing detail page yet.
4. No slug field currently confirmed.
5. No public-safe listing view/API yet.
6. Existing anonymous access correctly returns no rows, so a deliberate public endpoint/view is required.
7. Existing `listing_visibility` does not support `public`; use `active_market` or migrate the constraint.
8. Existing publication data coverage is low, so published rows must be backfilled or resaved through the listing page.

## Phase 2 Build Target

Create a public-safe read layer that joins:

- `private_listings`
- `listing_publication_data`
- `listing_media`

and returns only marketplace-safe fields.

Preferred implementation:

- Vercel API endpoint or Supabase RPC/view with a locked public contract.

Do not expose raw `private_listings` to anonymous users.

## Phase 2 Implementation

Implemented files:

- `server/services/publicListingsService.js`
- `server/services/publicListingsApi.js`
- `api/public/listings.js`
- `server/tests/publicListingsService.test.js`

Public endpoint:

- `GET /api/public/listings`
- `GET /api/public/listings?slug={slug}`

Supported list filters:

- `q`
- `listingType`
- `propertyType`
- `suburb`
- `city`
- `province`
- `minPrice`
- `maxPrice`
- `bedrooms`
- `bathrooms`
- `limit`
- `offset`

The endpoint uses the server-side Supabase service role but returns only the public listing contract. It does not expose raw internal rows.

Current live data result:

- The endpoint currently returns `0` eligible listings.
- This is expected because no listing currently satisfies all marketplace publication requirements.

Verification:

- `npm run test:public-listing-bridge`
- Direct service-role probe returned `{ count: 0, items: [] }`

## Phase 3 Implementation

Implemented public catalogue surfaces:

- `app.arch9.co.za/buy`
- `www.arch9.co.za/buy`
- `www.arch9.co.za/buy/:slug`

The public website consumes:

- `https://app.arch9.co.za/api/public/listings`
- `https://app.arch9.co.za/api/public/listings?slug={slug}`

Live verification on 2026-06-25:

- `https://www.arch9.co.za/buy` renders successfully.
- `https://app.arch9.co.za/api/public/listings?limit=3` returns an empty public contract: `{"items":[],"count":0,...}`.

The empty result is correct. The API is working, but no current listing satisfies the marketplace publication rule.

## Phase 4 Implementation

Implemented app-side publishing controls in:

- `src/pages/AgentListingDetail.jsx`

The Listing Site Data screen now supports:

- Preview public Arch9 Buy URL.
- Copy public Arch9 Buy URL.
- Publish to Arch9 Buy.
- Pause Arch9 Buy publication.
- Inline readiness blockers for missing public title, price, description, location, cover image, or excluded lifecycle status.

Publish action sets:

- `listing_publication_data.status = 'Published'`
- `private_listings.bridge_listing_status = 'published'`
- `private_listings.listing_visibility = 'active_market'`
- `private_listings.bridge_listing_public_url = https://www.arch9.co.za/buy/{slug}`

Pause action sets:

- `listing_publication_data.status = 'Draft'`
- `private_listings.bridge_listing_status = 'paused'`

Implemented dry-run backfill tool:

- `scripts/backfill-public-listing-publication-data.mjs`
- package script: `npm run backfill:public-listings`
- write mode: `npm run backfill:public-listings -- --apply`

Backfill safety rules:

- Dry-run by default.
- Does not fabricate media.
- Skips `sold`, `withdrawn`, and `transaction_created`.
- Requires active market visibility, published Arch9 bridge status, title, asking price, description, location, and at least one listing media image.

Latest staging diagnostic:

- `activePublished`: 29
- `eligibleNow`: 0
- `backfillable`: 8 by loose field availability, but those rows are not safe to publish because available media currently belongs to `sold` or `transaction_created` stock.

Decision:

- Do not force-publish existing rows.
- Use the new Listing Site Data publish controls for newly approved listings, or run the dry-run backfill after live listings have compliant media and lifecycle status.

## Phase 5 Implementation

Implemented a shared public listing readiness service:

- `server/services/publicListingReadinessService.js`

This service centralises:

- Public listing readiness blockers.
- Safe backfill blockers.
- Publication payload mapping.
- Public URL generation.
- Readiness summary/action queue generation.

Implemented diagnostics:

- `scripts/diagnose-public-listing-readiness.mjs`
- package script: `npm run diagnose:public-listings`
- Markdown mode: `npm run diagnose:public-listings -- --markdown`
- Live API skip mode: `npm run diagnose:public-listings -- --no-live`

Implemented tests:

- `server/tests/publicListingReadinessService.test.js`
- package script: `npm run test:public-listing-readiness`

Phase 5 diagnostic output is designed to answer:

- How many listings are eligible for `www.arch9.co.za/buy` right now?
- Which rows are blocked by lifecycle status?
- Which rows need images?
- Which rows need publication data saved?
- Whether the live public API count matches readiness expectations.

Phase 5 keeps the same launch safety posture:

- Sold, withdrawn, and transaction-created rows remain blocked.
- Missing image rows remain blocked.
- The diagnostic reports blockers; it does not publish data.

## Phase 6 Implementation

Implemented an in-app Arch9 Buy readiness queue on the Residential Listings page:

- `src/pages/AgentListings.jsx`

The Listings page now includes:

- An `Arch9 Buy` segmented filter row.
- Counts for:
  - Live
  - Ready
  - Needs Media
  - Needs Data
  - Blocked
- Per-listing Arch9 Buy status panels showing:
  - Public readiness state
  - Image count
  - Bridge status
  - Publication status
  - Action-oriented blocker summary

Implemented publication row loading in:

- `src/services/privateListingService.js`

Private listing reads now include:

- `publicationStatus`
- `listingPublicationData`
- `propertyDetails.publicationStatus`
- `propertyDetails.listingPublicationData`

This removes the Phase 5 blind spot where the listing page could not tell whether `listing_publication_data.status` was saved as `Published`.

Implemented Phase 6 regression test:

- `scripts/public-listing-phase6.test.mjs`
- package script: `npm run test:public-listing-phase6`

Phase 6 still does not publish unsafe data directly from listing cards. It routes the user to the existing Listing Site Data workspace, where Phase 4 publish guards enforce the final public listing requirements.

## Phase 7 Implementation

Implemented queue-to-action workflow improvements:

- Residential Listings Arch9 Buy status panels now include a direct action button:
  - `Publish`
  - `Fix Media`
  - `Complete Data`
  - `Review`
- These actions route directly to:
  - `/agent/listings/{listingId}?tab=listing`

Implemented deep-link support in:

- `src/pages/AgentListingDetail.jsx`

The listing detail page now:

- Reads `?tab={workspaceTab}` from the URL.
- Opens the requested seller workspace tab automatically.
- Keeps the URL in sync when users switch seller workspace tabs.

Operational impact:

- The Phase 6 queue is now actionable.
- Agents/principals can move from `Needs Media`, `Needs Data`, or `Ready` directly into the Listing Site Data workspace.
- The final publish action remains protected by the Phase 4 readiness guards.

Implemented Phase 7 regression test:

- `scripts/public-listing-phase7.test.mjs`
- package script: `npm run test:public-listing-phase7`

## Phase 8 Implementation

Implemented launch-safety checks for the final publish loop:

- Listing Site Data now includes a `Check Live` action.
- The check calls the public listings endpoint by slug:
  - `/api/public/listings?slug={slug}`
- After a successful publish, the app automatically checks the public endpoint.
- If the endpoint confirms the listing, the user sees:
  - `Listing published and confirmed live on Arch9 Buy.`
- If the endpoint does not confirm the listing, the readiness panel shows the public API response so the user knows the listing is not visible yet.

Canonical URL hardening:

- App-side public URLs are now regenerated as:
  - `https://www.arch9.co.za/buy/{slug}`
- The public API contract also regenerates canonical URLs from the current host and slug.
- Stored stale URLs, including old `bridgenine` URLs, are no longer trusted for public API output.

Development parity:

- The Vite dev server now exposes:
  - `/api/public/listings`
- This keeps local and preview testing aligned with the production Vercel API route.

Implemented Phase 8 regression test:

- `scripts/public-listing-phase8.test.mjs`
- package script: `npm run test:public-listing-phase8`

## Phase 9 Implementation

Implemented a controlled single-listing launch publisher.

Why:

- The live catalogue still returns `0` listings.
- The latest readiness diagnostic shows:
  - `78` listings scanned
  - `0` public eligible
  - `0` safe backfill candidates
- This means bulk publishing would be unsafe. Most blockers are missing publication rows, missing listing media, lifecycle statuses like `sold` or `transaction_created`, or non-public visibility.

Implemented shared launch planning in:

- `server/services/publicListingReadinessService.js`

New function:

- `createPublicListingLaunchPlan`

The plan returns:

- canonical public URL
- publication payload
- private listing patch
- current blockers
- launch blockers
- whether the listing can be safely applied

Implemented single-listing publisher:

- `scripts/publish-public-listing.mjs`
- package script: `npm run publish:public-listing`

Usage:

- Dry-run:
  - `npm run publish:public-listing -- --listing-id={listingId}`
- Apply:
  - `npm run publish:public-listing -- --listing-id={listingId} --apply`
- Verify only / with apply:
  - `npm run publish:public-listing -- --listing-id={listingId} --verify`

Safety posture:

- Dry-run by default.
- Requires an explicit listing ID.
- Does not publish sold, withdrawn, transaction-created, missing-media, missing-price, missing-description, or missing-location listings.
- Applies only when the launch plan has no blockers.
- After `--apply`, checks the live public API by slug.

Canonical URL hardening:

- `buildPublicListingUrl` now always returns the generated `www.arch9.co.za/buy/{slug}` URL.
- Stale stored public URLs are ignored by the readiness service as well as the public API service.

Implemented Phase 9 regression test:

- `scripts/public-listing-phase9.test.mjs`
- package script: `npm run test:public-listing-phase9`

## Phase 11 Implementation

Implemented a non-destructive launch candidate ranking layer.

Why:

- The public bridge is live.
- The publisher is guarded.
- The remaining operational question is which listing should be fixed first so Arch9 Buy can show real stock.

Implemented shared candidate reporting in:

- `server/services/publicListingReadinessService.js`

New function:

- `createPublicListingLaunchCandidateReport`

The candidate report:

- Scores listings by public launch readiness.
- Sorts ready-to-apply listings first.
- Groups blocked listings into:
  - `ready_to_apply`
  - `needs_media`
  - `needs_data`
  - `needs_publish_state`
  - `blocked_lifecycle`
- Includes the exact action items needed per listing.
- Includes the dry-run publish command per candidate.

Implemented candidate CLI:

- `scripts/report-public-listing-candidates.mjs`
- package script: `npm run report:public-listing-candidates`

Usage:

- JSON:
  - `npm run report:public-listing-candidates`
- Markdown:
  - `npm run report:public-listing-candidates -- --markdown`
- Limit:
  - `npm run report:public-listing-candidates -- --limit=10`

Safety posture:

- Read-only.
- Uses the existing readiness rules.
- Does not update publication rows, listing status, visibility, URLs, or media.
- Designed to decide which listing should be repaired before using `npm run publish:public-listing`.

Implemented Phase 11 regression test:

- `scripts/public-listing-phase11.test.mjs`
- package script: `npm run test:public-listing-phase11`

## Phase 12 Implementation

Implemented a guarded public listing media attachment workflow.

Why:

- Phase 11 showed `0` ready-to-apply listings.
- The closest launch candidates are blocked by missing media.
- The safe next step is to attach real, approved listing image URLs to one specific listing at a time.

Implemented shared media planning in:

- `server/services/publicListingReadinessService.js`

New functions:

- `normalizePublicListingMediaUrls`
- `createPublicListingMediaAttachmentPlan`

The media attachment plan:

- Accepts one listing and one or more image URLs.
- Rejects invalid URLs.
- Blocks duplicate image URLs.
- Preserves existing media.
- Sets the first attached image as cover only when the listing does not already have a cover image.
- Produces insert rows for `listing_media`.

Implemented media CLI:

- `scripts/attach-public-listing-media.mjs`
- package script: `npm run attach:public-listing-media`

Usage:

- Dry-run:
  - `npm run attach:public-listing-media -- --listing-id={listingId} --image-url={httpsImageUrl}`
- Multiple images:
  - `npm run attach:public-listing-media -- --listing-id={listingId} --image-url={url1} --image-url={url2}`
- Apply:
  - `npm run attach:public-listing-media -- --listing-id={listingId} --image-url={httpsImageUrl} --apply`
- Optional caption:
  - `npm run attach:public-listing-media -- --listing-id={listingId} --image-url={httpsImageUrl} --caption="Front exterior"`

After apply:

- The script reloads the listing.
- It returns the post-attach launch plan.
- If the listing is now ready, it returns the next command:
  - `npm run publish:public-listing -- --listing-id={listingId}`

Safety posture:

- Dry-run by default.
- Requires a listing ID.
- Requires at least one valid `http` or `https` image URL.
- Does not publish the listing.
- Does not change listing status, visibility, publication rows, or public URLs.
- Only inserts rows into `listing_media` when `--apply` is explicitly passed.

Implemented Phase 12 regression test:

- `scripts/public-listing-phase12.test.mjs`
- package script: `npm run test:public-listing-phase12`
