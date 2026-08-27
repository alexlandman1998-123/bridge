# Buyer portal Phase 0 stabilization

## Scope

Phase 0 stabilizes the existing buyer portal before the prospect-demo design is connected to production data. It does not change portal permissions, RLS policies, database schema, upload behavior, or release routing.

## Implemented safeguards

- Seller compliance projections normalize explicit `null` listing, selling-context, and portal inputs. Buyer-only portals no longer fail while calculating seller-derived status.
- Regression coverage includes an empty buyer-only context and a populated buyer context with no selling workspace.
- The prospect demo renders an unbranded loading skeleton until the exact requested slug has resolved. It cannot flash the previous prospect or the default Produktive branding when a route token changes.
- Buyer and seller production routes remain behind the existing token gate and error boundary.

## Release gates

Run from `the-it-guy/`:

```bash
node --test src/core/documents/__tests__/sellerComplianceAgentStatusModel.test.js
node --test scripts/buyer-portal-phase0-stability.test.mjs
npm run build
```

Browser smoke matrix:

| Context | Desktop | Mobile | Expected result |
| --- | --- | --- | --- |
| Prospect buyer demo | Required | Required | Neutral skeleton, then correct prospect brand and portal |
| Buyer-only production fixture | Required | Required | Portal loads without seller-context exception |
| Buyer with selling context | Required | Required | Workspace switch and both journeys remain available |
| Seller-only portal | Required | Required | Existing password/token flow remains unchanged |
| Bond buyer | Required | Required | Finance and bond application sections remain enabled |
| Cash buyer | Required | Required | Bond-only controls remain hidden |

Production rollout and deployment are intentionally outside this change. Complete the smoke matrix against a preview deployment before promotion.

## Local verification evidence

Verified against the production build on 27 August 2026:

| Check | Result |
| --- | --- |
| Seller compliance model regression suite | 6 passed, 0 failed |
| Phase 0 route and branding guards | 3 passed, 0 failed |
| Production build | Passed in 2m 16s |
| Buyer fixture, desktop | Loaded with no page error and no horizontal overflow |
| Buyer fixture, 390px viewport | Loaded with no page error and no horizontal overflow |
| Prospect demo, 390px viewport | Neutral loading state followed by Home Seekers branding; no page error or horizontal overflow |

Build-size baseline:

- `ClientPortal`: 942.33 kB minified / 220.06 kB gzip.
- `ProspectBuyerDemo`: 118.84 kB minified / 25.61 kB gzip.

Known pre-existing observations retained for later phases:

- The build reports existing large-chunk and mixed static/dynamic import warnings.
- The buyer fixture reports an existing multiple-Supabase-client warning. It does not prevent the portal from loading, but should be removed when the portal data layer is consolidated.
