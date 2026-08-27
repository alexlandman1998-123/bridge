# Buyer portal Phase 2 shared overview

## Outcome

The prospect demo and production buyer portal now render their desktop overview through one presentation contract. The shared layer owns layout, hero hierarchy, current-stage summary, attention treatment, activity/document placement, insights, and support ordering.

Production continues to supply live transaction models, route-aware actions, comments, documents, team contacts, permissions, and mutations. The prospect demo supplies fixture data and demo-only interactions.

## Implemented

- Added a canonical overview shell with named regions in a fixed responsive order.
- Added a shared overview hero for the welcome, attention state, property summary, purchase status, stage, next stage, metrics, and progress ring.
- Moved the demo overview to the same hero and two-column activity/document composition as production.
- Preserved production route actions by injecting existing `SellerPortalAction` controls into the presentation component.
- Preserved production update and document components as live-data slots.
- Preserved mobile component trees, seller views, token gates, and workspace switching.
- Added source guards preventing production services or demo fixtures from leaking into the shared presentation layer.

## Update contract

Overview layout and hero changes belong in `src/components/client-portal/BuyerPortalOverview.jsx`. Production data adaptation stays in `ClientPortal.jsx`; prospect fixtures stay in `ProspectBuyerDemo.jsx`. Shared presentation components must not import portal services, upload functions, or comment mutations.

## Release gates

Run from `the-it-guy/`:

```bash
node --test src/components/client-portal/__tests__/buyerPortalTheme.test.js
node --test scripts/buyer-portal-phase0-stability.test.mjs
node --test scripts/buyer-portal-phase1-shared-shell.test.mjs
node --test scripts/buyer-portal-phase2-shared-overview.test.mjs
npm run build
```

Browser verification:

| Context | Viewport | Gate |
| --- | --- | --- |
| Prospect overview | Desktop and mobile | Shared overview markers, correct fixture content, branded hero, no overflow |
| Production buyer overview | Desktop and mobile | Live content, canonical actions, shared overview markers, no overflow |
| Production progress and documents | Desktop and mobile | Routes remain separate and unchanged |
| Seller workspace | Desktop and mobile | Buyer overview markers absent |
| Bond buyer and cash buyer | Desktop and mobile | Existing finance visibility rules remain intact |

Deployment remains outside this phase. Run the complete matrix against a preview deployment before promotion.

## Next phase

Phase 3 should unify the progress/journey presentation and status vocabulary, using one canonical buyer journey view model while retaining production workflow truth as the only source of stage state.

## Local verification evidence

Verified against the production build on 27 August 2026:

| Check | Result |
| --- | --- |
| Phase 0–2 targeted gates | 13 passed, 0 failed |
| Targeted lint | 0 errors; existing unused-variable warnings retained in the large portal pages |
| React quality review | Shared components contain no hooks, service imports, request waterfalls, or nested component definitions |
| Production build after legacy hero removal | Passed in 2m 23s |
| Prospect overview, desktop | Shared hero, progress, activity/document regions, Home Seekers branding and property image rendered; no overflow |
| Production buyer overview, desktop | Shared hero plus all five regions rendered from live fixture data; canonical document, mail and telephone links retained; no overflow |
| Production documents route, desktop | Shared overview absent; Sale Documents active; no overflow |
| Seller fixture, desktop | Shared buyer overview and buyer shell absent; no overflow |

Final bundle sizes:

- `ClientPortal`: 935.48 kB minified / 219.01 kB gzip (Phase 1: 940.35 / 219.81 kB).
- `ProspectBuyerDemo`: 115.08 kB minified / 24.94 kB gzip (Phase 1: 116.73 / 25.10 kB).

The buyer and demo mobile component trees are unchanged in Phase 2 and retain the Phase 0 390 px baseline. Repeat the full mobile matrix on the preview deployment before promotion.
