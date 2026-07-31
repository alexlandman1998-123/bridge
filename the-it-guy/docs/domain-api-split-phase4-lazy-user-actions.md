# Domain API Split Phase 4: Lazy User Actions

Date: 2026-07-31

## Scope

Phase 4 continues the Agent Listing Detail split by moving user-triggered and post-load service paths out of the static route graph. This phase does not change the underlying business services. It changes when they are loaded.

## What Changed

- Removed static imports from `src/pages/AgentListingDetail.jsx` for action-heavy carrier services.
- Lazy-loaded services used by user actions:
  - `src/lib/agencyCrmRepository.js`
  - `src/lib/buyerLifecycleService.js`
  - `src/lib/listingOffersService.js`
  - `src/services/communicationDeliveryService.js`
  - `src/services/leadListingInterestService.js`
  - `src/services/leadPropertySharingService.js`
  - `src/services/leadSuggestionService.js`
  - `src/services/notificationOutboxService.js`
  - `src/services/sellerDocumentReviewWorkflowService.js`
  - `src/services/sellerPortalActivationService.js`
  - `src/services/showDayLeadCaptureService.js`
- Localized small pure helpers/constants needed synchronously by the route:
  - offer intake labels and modes
  - seller review delivery preparation
  - seller portal lifecycle labels/previews
  - notification dispatch planning
  - listing delivery statistics
  - local offer invite/record readers

## Inventory Result

After Phase 4:

```bash
node scripts/domain-import-inventory.mjs --domain agent-listing-detail
```

Agent Listing Detail reports:

- tracked heavy static imports: 0
- tracked heavy dynamic imports: 5

Remaining heavy modules are intentionally lazy:

- `src/lib/api.js`
- `src/services/privateListingService.js`
- `src/lib/agencyPipelineService.js`

## Build Result

After `npm run build`, the selected-domain chunk audit passes for static route dependencies:

```bash
node scripts/domain-api-chunk-audit.mjs --domain agent-listing-detail --enforce --max-api-gzip-kb 1
```

- entry gzip: 81.9 KB / 140.0 KB
- static script gzip: 420.0 KB / 750.0 KB
- API route gzip: 0 B / 1.0 KB
- static API chunks: none

## Rollout Note

This phase makes the source import graph and the static production route graph clean. The stricter preload-reference audit still reports `api-*.js` in the generated Vite preload map because the click-time lazy services depend on API-backed modules. That reference is not a static route dependency, but it should remain report-only until Phase 5 decides whether to enforce only static route cleanliness or pursue a deeper service split that removes API-backed lazy-service dependencies too.
