# Rentals Phase 8 — Unit and Occupancy Foundation

Phase 8 makes a Unit the independently managed rentable object beneath a managed property. A house is represented by one `MAIN` unit; apartments, complexes and mixed-use properties can have many units.

## Included

- `rental_units`: physical facts, target rent, deposit, availability, operational status and active-tenancy claim.
- `rental_unit_status_history`: append-only status evidence, readable by scoped users but not mutable from the browser.
- A property-scope trigger that rejects cross-organisation or cross-branch unit writes.
- Unit list/create panel inside the Rental property workspace.

## Occupancy invariant

`active_tenancy_id` is populated only when a unit is `occupied`, and an occupied status requires that claim. The unit stores only one claim; a unique partial index prevents the same tenancy claim being reused.

The `rental_tenancies` table does not exist until Phase 29, so this migration intentionally does not invent it. Phase 29 must create the tenancy row and conditionally claim `rental_units.active_tenancy_id` in the same transaction (`WHERE active_tenancy_id IS NULL`), then add the tenancy-side partial unique index. The code-level claim helper already rejects a second active claim.

## Deployment and verification

Apply [20260829_rental_unit_foundation.sql](/Users/alexanderlandman/the-it-guy/the-it-guy/sql/20260829_rental_unit_foundation.sql) after the Phase 7 property migration through the existing SQL process. It is not remotely applied from this checkout.

`npm run test:rentals-phase8` covers single-house defaults, multi-unit labels, invalid financial facts and active-occupancy conflict handling.
