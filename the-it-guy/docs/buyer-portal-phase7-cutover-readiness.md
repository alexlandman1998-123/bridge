# Buyer portal Phase 7: cutover readiness

Phase 7 turns the Phase 0–6 migration into a fail-closed release contract. It does not create new transaction data, replace production mutations, or widen buyer/seller access.

## Canonical cutover surface

The buyer portal is considered aligned only when all six canonical surfaces are present:

- shared shell and navigation;
- overview;
- journey;
- documents;
- finance;
- team and support.

Four source-tagged presentation models—journey, documents, finance, and team—must all match the current portal source. A production model can never satisfy a demo cutover and a demo model can never satisfy production.

## Fail-closed production capabilities

The production release marker reports `aligned` only when the canonical models and these live adapters are available:

- document upload and document access;
- bond submission and matter-account proof upload;
- persisted portal comments;
- at least one real email or phone contact.

The demo has a separate simulation capability set and cannot claim production-write capability.

## Runtime verification marker

Buyer roots expose:

- `data-buyer-portal-release="phase7"`;
- `data-buyer-portal-aligned="aligned|blocked"`;
- `data-buyer-portal-source="demo|production"`.

Seller roots intentionally receive none of these buyer cutover markers.

These markers provide a deterministic local, preview, and live-production smoke-test target without exposing tokens or transaction data.

## Release gate

```bash
node --test src/core/clientPortal/__tests__/buyerPortalCutoverReadiness.test.js
node scripts/buyer-portal-phase7-cutover-readiness.test.mjs
node scripts/buyer-portal-phase0-stability.test.mjs
node scripts/buyer-portal-phase1-shared-shell.test.mjs
node scripts/buyer-portal-phase2-shared-overview.test.mjs
node scripts/buyer-portal-phase3-canonical-journey.test.mjs
node scripts/buyer-portal-phase4-canonical-documents.test.mjs
node scripts/buyer-portal-phase5-canonical-finance.test.mjs
node scripts/buyer-portal-phase6-canonical-team.test.mjs
npm run build
```

Production promotion is allowed only after the entire chain passes and a browser smoke confirms the Phase 7 marker, canonical surfaces, contact routes, responsive width, and action-state propagation.
