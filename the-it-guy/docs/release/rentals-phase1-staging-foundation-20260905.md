# Rentals Phase 1 — Staging foundation recovery gate

Checked: 5 September 2026  
Project: Arch9 Staging (`vaszuxjeoajeuhlcnzzf`)

## Implemented control

The repository now contains a read-only staging readiness gate:

```sh
npm run report:rentals-staging-foundation
```

Use the fail-closed variant in a release gate:

```sh
npm run verify:rentals-staging-foundation
```

The command never selects a database implicitly and only runs migration-list
and catalog-read queries. It does not call `db push`, `migration repair`,
`db reset`, or any data-changing SQL.

## Current result

The foundation is **not ready**:

- 53 migration versions exist remotely but not locally.
- 262 migration versions exist locally but not remotely.
- Staging is missing all required rental objects:
  - `rental_properties`
  - `rental_units`
  - `rental_vacancies`
  - `rental_property_mandates`
  - `rental_applications`
  - `rental_tenancies`
  - `rental_set_updated_at()`

## Decision and next action

No rental migration was applied. The migration ledger must first be reconciled
through a reviewed recovery decision. Once that exists, establish the rental
property/unit/vacancy baseline through managed migrations, rerun the gate, and
only then apply the portal/application foundation.
