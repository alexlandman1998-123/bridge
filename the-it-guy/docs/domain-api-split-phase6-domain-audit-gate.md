# Domain API Split Phase 6: Domain Audit Gate

Date: 2026-07-31

## Scope

Phase 6 adds a release-style gate for the `agent-listing-detail` domain after the read facade, lazy user actions, and parity tests are in place.

This gate is intentionally scoped to static route cost. It does not claim the deeper lazy-service dependency split is complete.

## What Changed

- Added `scripts/domain-api-split-phase6-gate.test.mjs`.
- Added `npm run test:domain-api-split-phase6-gate`.
- The gate runs the Phase 5 parity test before evaluating audit output.
- The gate checks the Agent Listing Detail import inventory:
  - zero tracked heavy static imports
  - zero direct tracked heavy imports
  - zero transitive tracked heavy imports
  - retained heavy modules only through lazy dependencies
- The gate checks the built Agent Listing Detail route chunk:
  - route chunk exists
  - no static `api-*.js` dependency
  - API route gzip is `0 B` with preload enforcement off
  - entry gzip budget passes
  - static script gzip budget passes

## Command

Run after a production build:

```bash
npm run build
npm run test:domain-api-split-phase6-gate
```

## Current Gate Meaning

Passing this gate means Agent Listing Detail is safe to treat as statically split from the giant shared frontend API module.

It does not mean the generated Vite preload map is free of API references. That stricter check still reports `api-*.js` because click-time lazy services depend on API-backed modules. That is allowed for this phase and remains the explicit boundary for a future deeper service split.

## Promotion Rule

Use this gate before any Agent Listing Detail staged rollout or monitoring decision. Do not set `enforceClean: true` for `agent-listing-detail` in the global domain chunk audit until the stricter preload-reference audit also passes:

```bash
node scripts/domain-api-chunk-audit.mjs --domain agent-listing-detail --enforce --max-api-gzip-kb 1 --enforce-preload-references
```

## Rollback

If this gate fails, keep Agent Listing Detail report-only and fix the failed layer:

- Phase 5 parity failure: inspect lazy wrapper mappings and awaited action call sites.
- Import inventory failure: remove the restored static import path.
- Chunk audit failure: inspect the route chunk static dependency graph after `npm run build`.
