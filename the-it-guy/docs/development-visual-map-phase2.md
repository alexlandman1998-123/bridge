# Development visual map — Phase 2

Phase 2 promotes the published visual-map snapshot into one buyer-facing development explorer shared by desktop and mobile.

## Runtime ownership

- `PublicDevelopmentVisualExplorer.jsx` is the only public map/list renderer.
- Desktop and mobile pages compose this component; their previous point-map implementations have been removed.
- The explorer reads `mediaLibrary.visualMap.publishedSnapshot` through the canonical Phase 0 model.
- Legacy point mappings appear only through the canonical migration adapter. They are not a second persisted or running map system.

## Buyer experience

- Polygon overlays reflect live availability, reserved, sold, and unreleased states.
- Map hover, map selection, and inventory cards share one selection state.
- Search and filters cover type, price, availability, bedrooms, floor, phase, and release date when those fields exist.
- Filters and the selected unit are encoded in the page URL for sharing.
- The canvas supports pan, zoom, full screen, list/grid layouts, and scene navigation.
- Selecting a residence opens a responsive detail drawer with facts, imagery, floor plan, and an enquiry hand-off.
- Mobile uses the same engine with a map/residences switch, filter sheet, and bottom detail sheet.

## Verification

Run:

```sh
npm run test:development-visual-map
npm run test:development-visual-explorer
npm run build
```
