# Domain API Baseline Phase 0

Date: 2026-07-31

## Purpose

This phase records the current route-level dependency on the giant shared frontend API chunk before any follow-up domain split starts. The goal is to make each future extraction measurable, keep Dashboard protected, and avoid turning the next domain pass into a broad platform refactor.

The machine-readable baseline is stored in:

- `docs/domain-api-baseline-phase0.json`

## Baseline Commands

Use a fresh production build before recapturing this baseline:

```bash
npm run build
node scripts/domain-api-chunk-audit.mjs --json
npm run audit:domain-api-chunks
npm run test:domain-api-chunks
```

To inspect one domain before work starts:

```bash
node scripts/domain-api-chunk-audit.mjs --domain agent-listing-detail
```

To prove a candidate is ready for enforcement:

```bash
node scripts/domain-api-chunk-audit.mjs --domain agent-listing-detail --enforce --max-api-gzip-kb 1 --enforce-preload-references
```

## Current Baseline

The current shared API chunk is `assets/api-DjPJNwIO.js` at 1.60 MB raw / 373.9 KB gzip.

| Domain | Status | Entry gzip | Static script gzip | Static deps | API static deps | API gzip carried |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Dashboard | Clean, enforced | 72.6 KB | 387.1 KB | 32 | 0 | 0 KB |
| Client Portal | Report-only, coupled | 192.4 KB | 943.5 KB | 49 | 1 | 373.9 KB |
| Attorney Transaction Detail | Report-only, coupled | 181.2 KB | 841.2 KB | 55 | 1 | 373.9 KB |
| Pipeline | Report-only, coupled | 147.0 KB | 1.30 MB | 73 | 1 | 373.9 KB |
| Agent Listing Detail | Report-only, coupled | 84.8 KB | 1.01 MB | 64 | 1 | 373.9 KB |
| Unit Detail | Report-only, coupled | 68.9 KB | 1.03 MB | 57 | 1 | 373.9 KB |

## Measured Coupling Order

Sorted by total static script gzip currently loaded by the route:

1. Pipeline: 1.30 MB
2. Unit Detail: 1.03 MB
3. Agent Listing Detail: 1.01 MB
4. Client Portal: 943.5 KB
5. Attorney Transaction Detail: 841.2 KB

Sorted by route entry gzip:

1. Client Portal: 192.4 KB
2. Attorney Transaction Detail: 181.2 KB
3. Pipeline: 147.0 KB
4. Agent Listing Detail: 84.8 KB
5. Unit Detail: 68.9 KB

## Recommended Implementation Order

Use the measured baseline to understand impact, but split in the safest order:

1. Agent Listing Detail
2. Client Portal
3. Unit Detail
4. Attorney Transaction Detail
5. Pipeline

Agent Listing Detail is the best first repeat-domain candidate because it is already high-impact, has a narrower user journey than Client Portal, and shares enough of the same `privateListingService` coupling to create reusable extraction patterns. Pipeline is intentionally last despite the largest static script total because it has the widest workflow surface and the highest chance of accidental behavior changes.

## Phase 0 Exit Criteria

- Domain audit script exists and covers Dashboard plus the five follow-up domains.
- Dashboard remains enforced clean with no static `api-*.js` dependency.
- Follow-up domains are report-only until their own split is complete.
- Current domain sizes are captured in JSON and Markdown for future comparison.
- `npm run test:domain-api-chunks` remains green before any next-domain extraction starts.
