# Domain API Split Phase 3: Read-Only Facade

Date: 2026-07-31

## Scope

Phase 3 starts the first follow-up domain split for `Agent Listing Detail`. The change is intentionally behavior-preserving: read paths now go through a narrow facade, while existing mutation services are loaded lazily only when the user triggers those actions.

This avoids reimplementing private-listing row mapping or appointment behavior during the first pass.

## Files Changed

- `src/lib/api/agentListingDetailApi.js`
- `src/pages/AgentListingDetail.jsx`

## Facade Boundary

The new facade exposes read-oriented functions used by the listing detail route:

- `getPrivateListing`
- `listAppointmentsAsync`
- `getSellerPortalAccessState`
- `getSellerPortalSecurityDiagnostics`
- `createPrivateListingDocumentDownloadUrl`
- `isSellerPortalInviteReadyAfterSignedMandate`

The facade does not statically import:

- `src/services/privateListingService.js`
- `src/lib/agencyPipelineService.js`

Service calls are delegated through dynamic imports so the route can stop carrying these modules as direct static dependencies.

## Mutation Handling

Mutation-heavy functions remain backed by the existing services and are intentionally lazy-loaded from `AgentListingDetail.jsx`:

- listing update/delete
- seller onboarding send
- seller portal invite/access management
- listing distribution sync
- listing document/media uploads
- appointment creation

This keeps production behavior unchanged while moving the first-load dependency boundary.

## Import Inventory Result

After Phase 3:

```bash
node scripts/domain-import-inventory.mjs --domain agent-listing-detail
```

Agent Listing Detail now reports:

- tracked heavy static imports: 9
- tracked heavy dynamic imports: 5
- no direct static import from `src/pages/AgentListingDetail.jsx` to `src/services/privateListingService.js`
- no direct static import from `src/pages/AgentListingDetail.jsx` to `src/lib/agencyPipelineService.js`

Remaining static coupling is transitive through:

- `src/lib/buyerLifecycleService.js`
- `src/lib/agencyCrmRepository.js`
- `src/services/leadAnalyticsService.js`
- `src/services/leadListingInterestService.js`
- `src/services/leadSuggestionService.js`
- `src/services/sellerPortalActivationService.js`
- `src/services/showDayLeadCaptureService.js`

## Next Boundary

The next safe pass should target the remaining transitive carriers, not the listing page itself. Prioritize:

1. read-only lead interest/listing analytics facades
2. read-only CRM lead workspace facade
3. suggestion read/action isolation
4. seller portal activation pure helpers and lazy actions
5. buyer lifecycle imports that pull in private listing service

Do not enable `agent-listing-detail` as an enforced-clean domain yet. It still carries tracked heavy modules transitively.
