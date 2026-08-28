# Route query ownership — Phase 4

Primary routes now declare a single page-level query owner in `src/lib/routeQueryOwnership.js`. Shared app shells provide authentication and organisation context only; they do not import page data services.

## Runtime rules

- A route query runs through `useRouteQueryOwner`.
- Starting the same owned query again aborts the previous request.
- Unmounting the route aborts every request owned by that route.
- Effects depend on primitive filter values rather than unstable filter objects.
- Pipeline Overview loads its independent data sets in one route-specific service and forwards the route abort signal to every Supabase query.
- A missing `private_listings` table is recorded in the session registry. All known listing entry points return an empty result without probing the missing table again.
- Reports declare no query owners and remain locked, so their hidden routes make zero requests.

Run `npm run test:route-query-ownership-phase4` to verify these boundaries.
