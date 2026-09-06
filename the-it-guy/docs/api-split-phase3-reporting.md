# API-split Phase 3: reporting extraction

The reporting domain is the first low-risk extraction.

- New reporting consumers import from `src/domains/reporting/api.js`.
- `src/lib/api/dashboardApi.js` remains a compatibility entry point for existing callers.
- The implementation modules remain in `src/lib/api/` temporarily because existing test evidence references them directly.
- The large legacy `src/lib/api.js` is unchanged in this pass; its duplicate dashboard operations will be retired only after all callers and behavioural tests have moved.

Verify the compatibility bridge and dashboard behaviour with:

```sh
node scripts/api-split-phase3-reporting.test.mjs
node src/lib/api/__tests__/dashboardCoreSummary.test.js
node scripts/api-split-phase2-boundaries.test.mjs
```
