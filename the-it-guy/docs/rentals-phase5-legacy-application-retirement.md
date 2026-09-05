# Rentals Phase 5: legacy application retirement

## Completed

- Removed the unused legacy `RentalApplicationsPage` from the Rental lazy-route boundary.
- Kept `/agent/rentals/pipeline/applications` as a compatibility redirect to `/agent/rentals/applications`; it no longer exposes the legacy writer.
- Moved the Rental dashboard application read to canonical `rental_applications` records.
- Updated the module route registry to identify `/agent/rentals/applications` as the applications surface.

## Deliberately retained

`rentalApplicationDraftService` and its activity-backed models remain only as a read adapter for the existing legacy tenancy/lease workspace. They must not be used for new application capture. Retire them when tenancy creation is migrated to the canonical tenancy conversion RPC, after the staging foundation gate is green and historical lease activity has been reconciled.

## Database safety

No destructive data migration, table drop, or production/staging schema change is part of this phase. The required canonical schema remains blocked behind the Phase 1 staging readiness gate.
