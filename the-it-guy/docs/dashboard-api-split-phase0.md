# Dashboard API And Hydration Phase 0

Date: 2026-07-31

## Purpose

This phase records the current dashboard bundle dependency on the shared frontend API module and the current broad dashboard hydration surfaces before extraction or summary-first loading work starts. The goal is to make the risk measurable and give later phases narrow regression guards.

## Baseline Commands

```bash
npm run baseline:performance
npm run test:performance-budget
npm run audit:dashboard-api-chunk
npm run audit:dashboard-hydration
```

API chunk enforcement check:

```bash
npm run test:dashboard-api-chunk
```

Hydration enforcement is expected to pass in Phase 0 and should stay passing while Phase 1 and Phase 2 are developed:

```bash
npm run test:dashboard-hydration
```

## Current Build Snapshot

`npm run baseline:performance` passed and refreshed:

- `docs/performance-baseline.json`
- `docs/performance-baseline.md`

Current key build measurements:

- Scripts: 19.96 MB raw / 5.22 MB gzip
- Styles: 1.19 MB raw / 154.6 KB gzip
- Initial load: 1.77 MB raw / 330.3 KB gzip
- Dashboard route chunk: `assets/Dashboard-DmUblMNw.js` at 286.1 KB raw / 69.8 KB gzip
- Shared API chunk: `assets/api-dhFMhN6M.js` at 1.65 MB raw / 385.9 KB gzip

Browser cold-load baseline was captured with:

```bash
npm run preview -- --host 127.0.0.1 --port 4173
npm run baseline:performance:browser
```

Current unauthenticated route measurements:

- `/bridge`: FCP 876 ms, 1.15 MB transfer, 2.87 MB decoded
- `/auth`: FCP 700 ms, 422.3 KB transfer, 1.95 MB decoded
- `/dashboard`: FCP 700 ms, 423.5 KB transfer, 2.00 MB decoded

The `/dashboard` browser baseline resolved to `/auth` in the unauthenticated local preview run. Treat it as a cold-load smoke metric, not a logged-in role dashboard benchmark. The logged-in dashboard comparison should be captured during the staging rollout with real role accounts.

`npm run test:performance-budget` passed against the refreshed baseline:

- Total gzip: 6.57 MB
- Initial gzip: 330.3 KB
- Entry script gzip: 86.4 KB

## Dashboard API Chunk Audit

The new dashboard-specific audit is:

```bash
npm run audit:dashboard-api-chunk
```

It reports:

- The built dashboard route chunk.
- Static dependency count from the dashboard chunk.
- Static script dependency gzip.
- Any `api-*.js` chunks imported by the dashboard.
- Any `api-*.js` chunks referenced in Vite's route preload map.

Current audit result:

- Dashboard static dependencies: 56
- Dashboard static script dependency gzip: 1.01 MB
- Dashboard route chunk: `assets/Dashboard-BScjwRbK.js` at 348.8 KB raw / 85.2 KB gzip
- Dashboard depends on `assets/api-DFQET0mg.js`
- API route dependency gzip: 385.9 KB

## Enforcement

The enforcement command is:

```bash
npm run test:dashboard-api-chunk
```

It enforces the current Phase 0 baseline ceiling:

```txt
Dashboard API route dependency must stay below 400 KB gzip.
```

Keep tightening this limit as the dashboard imports move to narrower API modules. Once the split is complete, lower the ceiling and add this command to `build:guarded`.

## Dashboard Hydration Audit

The hydration-specific audit is:

```bash
npm run audit:dashboard-hydration
```

It reports the current dashboard surfaces that can grow with developments, units, transactions, documents, issues, handovers, role players, and commission snapshots. This is a static guardrail for the Phase 0 diagnosis, not a replacement for logged-in staging timing.

Current tracked surfaces:

- Dashboard initial loader entrypoints.
- Developer overview unit hydration.
- Developer overview transactions-by-unit-id hydration.
- Developer overview buyer hydration.
- Developer overview handover hydration.
- Developer overview client issue hydration.
- Dashboard commission snapshot hydration.
- Participant dashboard access resolution.
- Principal transaction list summary query.
- Transaction summary relation hydration.
- Bond intake document/document-request hydration.
- Bond intake role-player hydration.

Current audit result:

- Hydration surfaces present: 12 of 12.
- High-risk surfaces: 5.
- Medium-risk surfaces: 6.
- Dashboard loader entrypoints: 3.
- Developer overview transaction-id batch filters: 2.
- Developer overview unit-id batch filters: 4.
- Transaction summary transaction-id batch filters: 5.
- Transaction summary id batch filters: 3.

The enforcement command is:

```bash
npm run test:dashboard-hydration
```

This guard is intentionally set to the current baseline. It should fail if another broad dashboard hydration surface or batch identifier filter is added before the summary-first dashboard work lands. Reducing surfaces should continue to pass.

## Phase 0 Exit Criteria

- Current production build is captured.
- Existing aggregate performance budget passes.
- Dashboard-specific audit exists and identifies the current shared API chunk dependency.
- Dashboard hydration audit exists and identifies the current broad hydration surfaces.
- Enforcement modes exist and give concrete fail conditions for later phases.
