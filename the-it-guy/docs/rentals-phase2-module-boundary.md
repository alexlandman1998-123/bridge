# Rentals Phase 2 — Module Boundary

The Rentals entry point is now `src/modules/rentals`. It owns rental page loading, module error isolation, public route metadata and the public API seam for future repositories.

## Rules

- `App.jsx` imports Rentals only through `src/modules/rentals`.
- Rental pages remain lazy imports behind `rentalRouteLoaders.js`.
- Future rental pages/components must call module repositories through `shared/api`, never Supabase directly.
- Shared platform services are consumed through explicit adapters; no Sales workflow code is imported into the rental domain.
- Existing pages remain temporarily in `src/pages/rentals` while later feature phases migrate them one at a time. Their routes and behavior are unchanged.

## Verification

```bash
npm run test:rentals-phase2
npm run test:sales-listing-workspace-phase3
npm run test:rental-listing-workspace-phase4
```
