# Development visual map — Phase 5 production readiness

Phase 5 hardens the canonical visualiser for controlled public release.

## Publication audit

`auditDevelopmentVisualMap` validates the same `mediaLibrary.visualMap` used by the editor and public renderer. It checks:

- the default scene and reachability from it;
- parent and child scene references;
- reciprocal parent/child relationships;
- scene backgrounds where mapped content exists;
- missing child scenes;
- duplicate targets and geometry;
- inventory mappings whose units no longer exist;
- inventory units that have not yet been mapped; and
- total mapped-inventory coverage.

Structural errors block the existing development publication action. Unmapped inventory and orphaned historical targets are warnings, allowing legitimate staged releases while keeping the risk visible.

Mapping Studio displays the audit result, blocker count, warnings, and coverage percentage while administrators work.

## Public resilience

- Plan images are preloaded and have explicit loading, missing, and failed states.
- A failed plan never hides inventory; the list remains usable.
- Published structural problems receive a restrained public fallback message.
- The map has an accessible application label and keyboard zoom controls.
- Escape closes comparison, residence details, and full-screen mode in that order.
- Result counts announce filter changes.
- Hotspot filtering is memoized and visual geometry remains in the single shared SVG renderer.

## Runtime ownership

No parallel validator or release workflow was introduced. The audit is part of the canonical visual-map module, Mapping Studio consumes it during editing, and the existing publication handler enforces it.
