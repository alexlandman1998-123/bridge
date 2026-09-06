# API-split Phase 1: contracts and dependency inventory

Run this before every extraction pull request:

```sh
node scripts/api-split-phase1-inventory.mjs --strict
node scripts/api-split-phase1-inventory.test.mjs
```

The inventory records the complete `src/lib/api.js` export surface, an SHA-256 fingerprint of that surface, direct application callers, a domain classification, and the critical user workflows that need behavioural evidence before moving their implementation.

The registry is [api-split-phase1-contract-registry.mjs](../scripts/api-split-phase1-contract-registry.mjs). A function must not be moved until its listed test evidence covers the route being changed. Add focused tests there before extracting a critical function.

`sourceCoupledTestCount` is a baseline measurement, not a current release blocker. As domains are extracted, replace tests that read `src/lib/api.js` with behavioural tests of the new domain API; do not create new source-coupled checks.

The API-export fingerprint is checked in and may change only in a deliberate public-contract change. A move-only extraction should keep both the export count and fingerprint unchanged.
