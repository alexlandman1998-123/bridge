# Attorney release readiness — Phase 2 action surfaces

## Objective

Every active transfer, bond, and cancellation stage must expose an enabled command or workspace destination. Read-only users must not receive mutation controls, and irrelevant finance or cancellation lanes must remain suppressed.

## Gate

Run `npm run test:attorney-release-phase2`.

The gate covers every transfer stage produced by the canonical registry, all 17 bond stages, and all 19 cancellation stages. It also verifies non-linear work, cash suppression of bond work, no-existing-bond suppression of cancellation work, role-scoped mutations, and visible success, error, and saving feedback in the attorney operations UI.

## Manual staging follow-up

Once the three Phase 0 browser actors are available, open every action using its assigned role and confirm persistence after refresh. The automated gate proves wiring and policy; the browser pass proves the deployed environment, forms, and backend permissions.
