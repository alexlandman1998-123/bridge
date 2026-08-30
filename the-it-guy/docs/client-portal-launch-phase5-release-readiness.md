# Client portal launch — Phase 5 release readiness

## Outcome

Phase 5 provides the final fail-closed release decision for the buyer and seller portals. It does not enable production rollout automatically. A release can progress only to a single approved agency pilot after automated checks and human evidence return `GO_FOR_ONE_AGENCY_PILOT`.

## Runtime evidence

Buyer and seller portals publish the privacy-safe `arch9-client-portal-launch-metrics-v1` snapshot in the browser. It contains only:

- Persona and redacted route template
- Navigation type
- Useful-content time
- Largest Contentful Paint
- Cumulative Layout Shift
- Capture timestamp

Portal tokens, client identifiers, names, contact details, addresses, and transaction data are excluded. The snapshot is available through `window.__arch9ClientPortalLaunchMetrics`, the `data-client-portal-launch-metrics` document attribute, and the `arch9:client-portal-launch-metrics` browser event for production test automation.

## Required release evidence

Complete [`config/client-portal-launch-phase5-evidence.json`](../config/client-portal-launch-phase5-evidence.json) with immutable evidence links for:

1. Production performance against the Phase 0 budgets.
2. Physical iOS and Android testing.
3. Buyer and seller capability-parity scripts.
4. Keyboard, screen-reader, and contrast verification.
5. Monitoring, support, and rollback ownership plus a successful rollback exercise.
6. Zero open critical and high-severity defects.
7. Product-owner sign-off.

Missing phase certification, missing evidence, missing owners, an untested rollback, an absent production build identifier, or a budget breach returns `HOLD`.

## Controlled rollout

[`config/client-portal-launch-phase5-rollout.json`](../config/client-portal-launch-phase5-rollout.json) remains disabled by default. The first release is bounded to one approved agency, never expands automatically, and requires 72 hours of observation before a separate expansion decision.

Rollback is required for a critical defect, confirmed data exposure, route crash, buyer/seller primary-task failure, or sustained useful-content budget breach.

## Commands

Generate a non-blocking readiness report:

```bash
npm run report:client-portal-launch-phase5
```

Enforce the release gate in CI or immediately before pilot activation:

```bash
npm run gate:client-portal-launch-phase5
```

The gate exits non-zero unless the result is `GO_FOR_ONE_AGENCY_PILOT`. It never edits rollout configuration or activates the pilot.

## Current decision

The Phase 5 implementation and Phase 2 responsive certification are complete, but the initial evidence file intentionally contains `pending` values. The correct current decision remains `HOLD` until production, physical-device, accessibility, operational, defect, and product-owner evidence is supplied.
