# Development visual map — Phase 0 foundation

## Canonical ownership

`marketing_content.mediaLibrary.visualMap` is the only persisted interactive-map model.

It owns:

- schema version and revision;
- draft/published state;
- the default scene;
- masterplan, phase, building, elevation, floor-plan and parking scenes;
- parent scene and parent hotspot relationships;
- image or geographic-map backgrounds;
- crop/viewports;
- point and polygon hotspots;
- links from hotspots to phases, buildings, floors, units, amenities, parking,
  storerooms and commercial inventory;
- hidden inventory targets and display order.

The model deliberately remains inside the existing `marketing_content` JSONB record.
Phase 0 therefore requires no second table, service, or deployment path.

## Retired persisted fields

The following `mediaLibrary` fields are no longer written:

- `sitePlanUrl`
- `sitePlanMap`
- `sitePlanViewport`
- `sitePlanNotShownUnitIds`
- `masterplanUrl`
- snake-case equivalents of those fields
- `visual_map`

Existing database records are imported through `resolveDevelopmentVisualMap` only
when `visualMap.scenes` is absent. Canonical data always wins and is never merged
with legacy data. The next normal development save rewrites that record using only
`visualMap`, which provides a safe rolling migration without a parallel runtime.

## Temporary compatibility projection

The current point-based editor and public renderers have not been duplicated or
rebuilt during Phase 0. They receive a transient projection of the canonical active
scene through `hydrateVisualMapMediaLibrary`. The projection is never persisted.

Phase 1 can replace the point editor with polygon editing while retaining the same
canonical data. Phase 2 can replace the public point renderer with SVG polygons
without changing the storage or publication contract again.

## Multi-storey contract

A building hotspot can specify `childSceneId`. The child scene records
`parentSceneId` and `parentHotspotId`. This supports:

`masterplan → building/elevation → floor plan → unit`

Polygon geometry is preserved when the old point editor changes a masterplan
background, crop, or point placement, so richer Phase 1/2 data cannot be flattened
accidentally.
