# Dashboard API Split Phase 1

Date: 2026-07-31

## Goal

Stop the Dashboard route from statically shipping the huge shared `api-*.js` chunk.

## What Changed

- Deferred agent/private-listing and appointment/pipeline services behind the background flows that need them.
- Split dashboard-only agency and private-listing readers out of broader feature services.
- Isolated shared transaction helper chunks that Rollup had previously parked in the API barrel.
- Moved listing offer status constants into `listingOfferStatus.js` so Dashboard can use agent summaries without importing the full offer service.

## Current Build Result

`npm run audit:dashboard-api-chunk` now reports:

- Dashboard chunk: about 284 KB raw / 72 KB gzip.
- Dashboard static script dependency gzip: about 387 KB.
- API chunks statically imported by dashboard: none.
- API chunks referenced in Dashboard's Vite preload map: none.

## Enforcement

```bash
npm run test:dashboard-api-chunk
```

This now fails if Dashboard statically imports any `api-*.js` chunk larger than 1 KB gzip.

Use the stricter preload check before rollout:

```bash
npm run test:dashboard-api-chunk -- --enforce-preload-references
```
