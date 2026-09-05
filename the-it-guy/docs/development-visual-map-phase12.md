# Development visualiser — Phase 12

Phase 12 adds a pre-publication proofing layer without creating a second visualiser. The preview mounts the existing public buyer explorer against the current draft map.

## Included

- Desktop, tablet, and mobile preview frames.
- Direct entry into the site plan, single-home, block, elevation, and floor journeys.
- Missing-asset, failed-image, and sold/reserved simulations.
- Per-journey dead-end, accessibility, image-size, hotspot-count, asset-state, and structural checks.
- Real browser image-loading validation.
- Draft-versus-live comparison and a last-known-good snapshot restore action.
- The same structural readiness gate is enforced by the publish action.

Warnings permit legitimate partial launches and explain the fallback. Structural errors block publication.

## Rollback behaviour

Restore live snapshot replaces the editable scenes and assets with the last published snapshot, marks the result as a new draft revision, and keeps the snapshot intact. The user must still save the draft, so the rollback is reviewable and reversible before persistence.
