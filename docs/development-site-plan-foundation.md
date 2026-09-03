# Development site-plan foundation

Phase 0 preserves the existing site-plan flow while later phases improve its usability.

## Canonical data

`marketingContent.mediaLibrary` is the single source of truth:

- `sitePlanUrl` is the background plan image.
- `sitePlanMap` is an object keyed by development unit id, containing percentage coordinates: `{ "unit-id": { "x": 42.5, "y": 63.1 } }`.

The legacy `sitePlans` array remains a compatibility fallback only. New plan uploads set `mediaLibrary.sitePlanUrl` and are saved through the normal development-details path.

## Current read and write path

1. Availability passes `sitePlanUrl` and `sitePlanMap` to `DevelopmentAvailabilityWorkspace`.
2. A manager places a selected unit; its percentage coordinates are saved through `handleAvailabilitySitePlanMapSave`.
3. The shared development details payload persists the marketing content unchanged alongside the existing public-page data.
4. `PublicDevelopmentLandingPage` and `MobilePublicDevelopmentExperience` read that same media-library plan and marker map.

## Compatibility rules

- Do not create a second map or unit-coordinate store.
- Do not rewrite existing `sitePlans` values or marker coordinates during UI work.
- Marker coordinates remain percentages so all Arch9 layouts use the same positions responsively.
- External syndication is asset-only until a destination supports an interactive-map contract.

Phase 1 may change discoverability and language, but must retain this contract.

## Syndication boundary

External development syndication is asset-only by default. The existing legacy
`sitePlans` payload continues to expose the approved site-plan image to listing
and portal integrations; it never includes `sitePlanMap` coordinates.

`buildDevelopmentSitePlanSyndicationPayload` is the explicit integration
contract for new connectors. It includes percentage unit coordinates only when
the destination declares `supportsInteractiveSitePlan: true`. Arch9 public
desktop and mobile pages remain the interactive-map consumers.
