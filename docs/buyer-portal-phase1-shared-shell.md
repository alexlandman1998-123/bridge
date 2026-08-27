# Buyer portal Phase 1 shared shell

## Outcome

Phase 1 makes the demo and production buyer portals consume one visual-branding contract. Production retains its live data, token gate, permissions, mutations, route structure, and buyer/seller workspace switching.

## Implemented

- One canonical theme model now normalizes primary, secondary, and accent colours and produces the sidebar, active-navigation, and hero-overlay treatments.
- Demo and production buyer navigation use the same active item primitive.
- Demo and production use the same branded support panel.
- The production buyer desktop shell adopts the demo's 264 px sidebar, spacing, 46 px navigation targets, 12 px radii, accent rail, and branded help treatment.
- The seller desktop shell remains at 280 px and keeps its existing navigation and styling.
- No database, Supabase policy, API, upload, or mutation contract changed.

## Update contract

Brand colour behavior must be changed in `src/components/client-portal/buyerPortalTheme.js`, not in an individual page. Desktop buyer navigation and support styling must be changed in `src/components/client-portal/BuyerPortalDesktopSidebar.jsx`. Both the prospect demo and production portal consume those sources.

## Release gates

Run from `the-it-guy/`:

```bash
node --test src/components/client-portal/__tests__/buyerPortalTheme.test.js
node --test scripts/buyer-portal-phase0-stability.test.mjs
node --test scripts/buyer-portal-phase1-shared-shell.test.mjs
npm run build
```

Browser verification:

| Context | Viewport | Gate |
| --- | --- | --- |
| Prospect buyer demo | Desktop and mobile | Correct brand, navigation, support actions, no overflow |
| Production buyer fixture | Desktop and mobile | Live data renders; routes and actions still work |
| Mixed buyer/seller fixture | Desktop | Workspace switch retains the seller shell |
| Bond buyer | Desktop and mobile | Finance and bond routes remain reachable |
| Cash buyer | Desktop and mobile | Bond-only controls remain hidden |

Deployment remains outside this phase. Promote only after the preview smoke matrix passes.

## Next phase

Phase 2 should extract the shared overview composition (property hero, current-stage summary, attention queue, document snapshot, and team updates) so demo fixtures and production models render through the same presentation components.

## Local verification evidence

Verified against the production build on 27 August 2026:

| Check | Result |
| --- | --- |
| Canonical theme unit tests | 3 passed, 0 failed |
| Phase 0 stability guards | 3 passed, 0 failed |
| Phase 1 shared-shell guards | 3 passed, 0 failed |
| Targeted lint | 0 errors; existing unused-variable warnings retained in the two large portal pages |
| Production build | Passed in 2m 42s |
| Prospect demo, desktop | Home Seekers brand, shared shell and support actions rendered; no horizontal overflow |
| Production buyer fixture, desktop | Live buyer data rendered; 264 px shell and accent active state applied; no horizontal overflow |
| Production progress route, desktop | Canonical route loaded and Transfer Journey became active |
| Seller fixture, desktop | Buyer shell marker absent; existing 280 px seller shell retained; no horizontal overflow |

Build-size comparison to the Phase 0 baseline:

- `ClientPortal`: 940.35 kB minified / 219.81 kB gzip (Phase 0: 942.33 / 220.06 kB).
- `ProspectBuyerDemo`: 116.73 kB minified / 25.10 kB gzip (Phase 0: 118.84 / 25.61 kB).
- Shared buyer portal theme and shell chunk: 4.72 kB minified / 2.02 kB gzip.

The Phase 1 changes do not alter the mobile buyer component tree. Phase 0's 390 px buyer and demo smoke evidence remains applicable; repeat the full mobile matrix on the preview deployment before promotion.
