# Development visualiser — Phase 13

Phase 13 refines the existing public explorer. It does not introduce another renderer, scene store, or 3D engine.

## Buyer experience

- Smooth, reduced-motion-aware scene and zoom transitions.
- Stronger hotspot focus, hover, and buyer-readable action prompts.
- Browser-style back navigation plus canonical breadcrumbs.
- Floor tabs when sibling floor-plan scenes exist.
- North/orientation indicator sourced from scene metadata.
- A first-use interaction hint stored once per browser.
- A next-scene preview card using the same likely-next-scene selection as prefetching.
- Keyboard arrow navigation between hotspot controls.
- Pointer dragging and two-finger pinch zoom.

## Performance contract

- The current scene is the only scene loaded initially.
- At most one likely next scene is prefetched after the current scene succeeds.
- No full-development image preload is performed.
- Optional AVIF and WebP scene sources are retained by the canonical map and exposed through CSS `image-set`, with the original image as fallback.
- Existing lightweight SVG overlays remain in use. No WebGL or 3D dependency was added.
