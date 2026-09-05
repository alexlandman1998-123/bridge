# Development visual map — Phase 1 Mapping Studio

## Delivered

- One full-screen Visual Mapping Studio inside the existing development
  availability workspace.
- Unit queue with mapped/unmapped progress.
- Polygon tracing with percentage-based coordinates.
- Vertex dragging, drawing undo/redo, label positioning, footprint replacement,
  and mapping removal.
- Status-coloured footprint preview.
- Duplicate target and duplicate geometry validation before saving.
- Scene selector using the Phase 0 masterplan/building/elevation/floor-plan model.
- Canonical draft saves through `mediaLibrary.visualMap`.
- Immutable published snapshot retained while a newer draft is edited.
- Crop remapping for both point and polygon geometry.

## Retired workflow

The previous single-click point-placement and “adjust selected” controls have
been removed from the availability workspace. Legacy points remain a supported
read format and appear in Mapping Studio only so an administrator can replace
them with a traced polygon.

PDF label detection remains an ingestion accelerator. An accepted label creates
a legacy point in the canonical scene; Mapping Studio clearly marks it for
conversion. It is not a separate persisted map.

## Publication safety

Any geometry, crop, background, or visibility edit returns the working map to
`draft`. The last published scenes remain inside `publishedSnapshot`. Public
desktop and mobile routes project the published snapshot until Marketing
publishes the updated visual map.

This prevents incomplete tracing work from changing a live development page.

## Phase 2 boundary

The public buyer-facing renderer still consumes a temporary point projection.
Polygon centroids provide those points, so units remain visible. Phase 2 should
replace that projection with the SVG polygon renderer and the premium map/list
experience without changing storage again.
