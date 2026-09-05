# Development visualiser — Phase 7

Phase 7 turns the existing scene hierarchy into a configurable visual journey without introducing a second renderer or data model.

## Canonical destination contract

Every hotspot now stores one `destination` object. Its type is one of:

- `scene` — open another aerial, exterior, elevation, floor-plan, interior, or amenity scene.
- `unit` — open the existing residence detail experience.
- `inventory_filter` — apply phase, block, floor, or unit-type filters to the existing inventory.
- `amenity` — surface lightweight amenity information.
- `external` — open an approved HTTP(S), email, or telephone destination.
- `none` — retain a visible mapped area with no navigation.

The schema is version 2. Existing `childSceneId` values are accepted only during migration and are immediately normalized into `destination: { type: "scene", sceneId }`. They are not written back, so the application does not maintain parallel navigation systems.

## Developer workflow

The existing mapping studio now supports aerial, exterior, interior, and amenity scenes. An agent maps an area once, selects its journey destination, and configures the relevant scene, unit, filter, amenity, or external link. Existing child-scene creation still writes into the same destination contract.

This supports the full range of development complexity:

- A single home can go from an aerial scene to an exterior render and then its property detail.
- A single block can go from an aerial scene to an elevation or floor plan and then a unit.
- A multi-block development can route from the masterplan to each block, floor, and unit.
- If a detailed render is unavailable, a hotspot can open filtered inventory instead.

## Runtime and fallbacks

The public explorer resolves every click centrally. Missing scene links fall back to the mapped unit or a relevant phase/block/floor inventory filter when possible. Missing units become a safe no-action state. Invalid external links are rejected by the publishing audit. Breadcrumbs continue to use scene parentage, while cross-links can open any valid scene.

Publishing is blocked for broken scene links, unreachable scenes, invalid external destinations, duplicate mappings, and scene loops. This keeps authoring flexible without allowing a broken public journey.
