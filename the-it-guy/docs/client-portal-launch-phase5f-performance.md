# Client portal launch — Phase 5F performance certification

## Outcome

Phase 5F converts the Phase 0 performance and stability budgets into a repeatable, fail-closed certification. Measurements must come from the current immutable candidate; observations from older previews cannot be reused.

## Measurement protocol

Use a 390×844 viewport and collect at least five samples per metric. Report p75 for timings and the maximum observed layout shift. Measure buyer and seller useful content with an empty cache on mobile slow 4G, then measure section navigation in the same warmed session.

Required budgets:

- Buyer useful content: 1,500 ms or less.
- Seller useful content: 1,500 ms or less.
- Slow-network core content: 2,500 ms or less.
- Cached navigation: 100 ms or less.
- Cumulative Layout Shift: 0.1 or less.
- Route crashes: zero.
- Dead controls: zero.

The browser publishes privacy-safe measurements through `arch9-client-portal-launch-metrics-v1`. Evidence must record raw samples and test conditions without portal tokens, client identifiers, addresses, contact details, or transaction data.

## Commands

```bash
npm run test:client-portal-launch-phase5f
npm run report:client-portal-launch-phase5f
npm run gate:client-portal-launch-phase5f
```

The enforced command returns non-zero for missing samples, missing evidence, stale candidate identity, or any budget breach. Only a passing report may promote Phase 5's production-performance evidence to `passed`.
