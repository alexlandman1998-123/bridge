# Rentals Phase 7 — Canonical Property Foundation

Phase 7 creates `rental_properties`, the first managed-rental source of truth. It is independent from `private_listings`; creating a property does not create, edit or expose a Sales listing.

## Included

- Managed properties: organisation, branch, manager, type, lifecycle and normalised address.
- Phase 6 canonical-party tables: typed party relationships and immutable workflow snapshots.
- Least-privilege grants and organisation/branch/manager RLS.
- Rental-only property index/detail routes and a paginated repository.
- An organisation-scoped active-address duplicate guard.

Snapshots are read-only to browser clients. A future server command records them, so a browser cannot rewrite workflow evidence.

## Deployment

Apply [20260829_rental_property_foundation.sql](/Users/alexanderlandman/the-it-guy/the-it-guy/sql/20260829_rental_property_foundation.sql) through the project’s existing SQL migration process before enabling property creation. This repository has no linked local Supabase project, so the migration was not executed remotely.

The migration does not alter `private_listings`, Sales contacts or Sales policies.

## Verification

`npm run test:rentals-phase7` checks normalisation, validation, RLS markers, Rental-only data access and the property UI boundary.
