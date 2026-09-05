# Development visualiser — Phase 11

Phase 11 formalizes the public fallback and capability engine. It builds on the publication audit but also handles runtime failures that cannot be known when a development is published.

## Capability selection

Every canonical scene is evaluated as one of:

- interactive visual;
- visual with inventory fallback;
- marketing visual;
- inventory only;
- unavailable.

The report records whether the scene has a configured and usable image, actionable hotspots, mapped inventory, a dead end, or a runtime image failure. Guided Setup shows the selected top-level experience and its plain-language reason.

## Hotspot fallbacks

The public explorer now resolves hotspot clicks through the capability engine:

- a valid visual destination opens normally;
- a failed visual containing one mapped residence opens that residence;
- an unavailable group visual opens phase, block, or floor-filtered inventory;
- an invalid or empty destination retains the existing safe no-action behavior;
- individual property details use an approved unit-type floor plan when no individual floor plan exists.

Runtime fallbacks never rewrite or publish the stored journey. They are projections of the existing canonical map and current inventory.

## Image failures and dead ends

Failed scene images are tracked for the current public session. Instead of exposing an empty canvas, the explorer explains the fallback and provides a direct route to the live residence list. Desktop inventory remains alongside the scene, and mobile visitors can switch immediately to residences.

Scenes without clickable actions still resolve to a visual-with-inventory or inventory-only experience when inventory exists. Administrators can see how many scenes depend on this fallback before publication.

## Verification matrix

The Phase 11 contract covers inventory-only developments, aerial marketing views, aerial-to-exterior journeys, failed scene images, elevation-without-mapping fallback, and unit-type floor-plan fallback. No second renderer, inventory store, or persistence format was introduced.
