# Attorney release readiness — Phase 3 propagation

## Objective

Attorney progress must converge on one transaction truth while respecting visibility and recipient boundaries.

## Destination contract

- Internal: attorney matter and attorney operations only.
- Professional shared: attorney matter, transaction workspace, attorney operations, and agent transaction view.
- Client visible: professional destinations plus only the explicitly selected buyer and/or seller portal.

A client-visible update with no selected recipient is rejected in both the UI and service boundary.

## Automated gate

Run `npm run test:attorney-release-phase3`. The cumulative gate includes Phases 1 and 2, shared-progress persistence, attorney operational contracts, live refresh, client-safe projection, notification reliability, propagation assurance, visibility mapping, and recipient isolation.

## Staging preflight

Run `npm run check:attorney-release-phase3:staging`. This is read-only: it verifies the deterministic fixture manifest and propagation-health RPC and reports unexplained gaps. Final live certification still requires the three Phase 0 browser actors to publish controlled updates and inspect each receiving module.
