# Rentals Phase 9 — Portfolio and management assignment

Phase 9 adds a Rental-only operational grouping layer. It does not read from or alter Sales listings, leads, mandates, or transactions.

## Delivered boundary

- `rental_portfolios` stores the operational name, optional branch scope, and assigned manager.
- `rental_portfolio_properties` makes a property belong to at most one portfolio. Upsert by `property_id` makes reassignment deliberate and concurrency-safe.
- The assignment trigger verifies the portfolio, property, organisation, and branch scopes before writing.
- `rental_portfolio_summaries` is a `security_invoker` view. It supplies property and unit totals in the portfolio-list query rather than issuing per-property queries.
- The frontend routes and pages are lazy-loaded under `/agent/rentals/portfolio`.

## Security and release

- Every exposed table has RLS enabled, anon/authenticated grants are reset, and write policies require scoped branch access plus manager/creator/admin authority.
- The summary view uses caller RLS; it is not a privileged bypass.
- Run `sql/20260829_rental_property_foundation.sql`, `sql/20260829_rental_unit_foundation.sql`, then `sql/20260829_rental_portfolio_foundation.sql` in the target environment after review. These reviewed migrations have not been applied from this workspace.
