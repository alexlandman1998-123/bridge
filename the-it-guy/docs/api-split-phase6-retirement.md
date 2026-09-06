# API-split Phase 6: caller migration and facade retirement

New reporting consumers must import from `src/domains/reporting/api.js`. The legacy `src/lib/api/dashboardApi.js` remains only as a compatibility facade for external or un-migrated callers.

Run the retirement guard before merging an extraction:

```sh
node scripts/api-split-phase6-retirement.test.mjs
```

The guard permits the current legacy `src/lib/api.js` import baseline to decrease, but not increase. It rejects all new imports from the legacy dashboard facade.

Do not delete a facade until its imports have reached zero and its public behavior has remained stable through the production observation window.
