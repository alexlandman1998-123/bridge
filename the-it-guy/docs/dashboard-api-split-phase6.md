# Dashboard API Split Phase 6

Date: 2026-07-31

## Goal

Repeat the dashboard split safely by domain and role instead of expanding the blast radius across the whole platform at once.

## What Changed

- Added `scripts/domain-api-chunk-audit.mjs`.
- Added role-scoped rollout gates for the developer dashboard aggregate and lazy panel hydration paths.
- Added enforced dashboard budgets for entry gzip, static script dependency gzip, and API route chunk gzip.
- Added report-only domain coverage for:
  - Dashboard
  - Client Portal
  - Attorney Transaction Detail
  - Pipeline
  - Agent Listing Detail
  - Unit Detail
- Kept Dashboard as the only enforced clean domain for now.
- Added `npm run audit:domain-api-chunks` for discovery.
- Added `npm run test:domain-api-chunks` for CI enforcement of cleaned domains.
- Added `npm run test:dashboard-performance-guards` as the combined dashboard regression gate.

## Rollout Switches

Defaults keep the optimized developer path on, while allowing staging or canary environments to narrow rollout by role.

```bash
VITE_DASHBOARD_AGGREGATES_ENABLED=true
VITE_DASHBOARD_AGGREGATE_ROLLOUT_ROLES=developer
VITE_DASHBOARD_LAZY_PANELS_ENABLED=true
VITE_DASHBOARD_LAZY_PANEL_ROLLOUT_ROLES=developer
VITE_DASHBOARD_ROLLUP_REFRESH_ENABLED=false
VITE_DASHBOARD_ROLLUP_REFRESH_ROLLOUT_ROLES=developer
```

Use `*` in a role list only after the domain audit and dashboard hydration audit are green for that wider audience.

## Enforced Budgets

Dashboard is currently the only enforced domain:

- Entry chunk gzip: 95 KB
- Static script dependency gzip: 475 KB
- API route chunk gzip: 1 KB

Other domains report their role ownership and budgets but do not fail CI until `enforceClean: true` is enabled for that domain.

## Current Domain Order

Use the latest build audit to pick the next domain. Current highest-impact candidates are:

1. Client Portal
2. Attorney Transaction Detail
3. Pipeline
4. Agent Listing Detail
5. Unit Detail

Each domain should follow the same pattern used for Dashboard:

1. Identify the route chunk and its static `api-*.js` path.
2. Extract read-only domain facades first.
3. Leave mutation-heavy and document-generation paths in their existing services until the route actually needs them.
4. Replace route imports with domain facades.
5. Build and run the domain audit.
6. Enable `enforceClean: true` for that domain only after the audit is clean.
7. Roll out through staging and canary before moving to the next domain.

## Commands

```bash
npm run build
npm run audit:domain-api-chunks
npm run test:domain-api-chunks
npm run test:dashboard-performance-guards
```

To inspect one domain:

```bash
node scripts/domain-api-chunk-audit.mjs --domain client-portal
```

To hard-check a candidate before enabling enforcement:

```bash
node scripts/domain-api-chunk-audit.mjs --domain client-portal --enforce --max-api-gzip-kb 1 --enforce-preload-references
```

## Promotion Rule

Do not mark a domain as enforced until both are true:

- `API chunks statically imported: none`
- `--enforce-preload-references` passes with `--max-api-gzip-kb 1`

This keeps Phase 6 incremental: each domain becomes protected only after its own split is complete.

## Rollback

If the developer dashboard path regresses in staging, set either switch to `false`:

```bash
VITE_DASHBOARD_AGGREGATES_ENABLED=false
VITE_DASHBOARD_LAZY_PANELS_ENABLED=false
```

That falls back to the full overview loader while keeping the Phase 6 audits in place.
