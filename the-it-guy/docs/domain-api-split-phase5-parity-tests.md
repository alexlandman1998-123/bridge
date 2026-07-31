# Domain API Split Phase 5: Parity Tests

Date: 2026-07-31

## Scope

Phase 5 adds a focused parity guard for the Agent Listing Detail lazy-action split. The goal is to catch regressions where a future edit accidentally restores eager service imports, forgets to await a lazy action, or changes facade behavior from the source service it mirrors.

## What Changed

- Added `scripts/domain-api-split-phase5-parity.test.mjs`.
- Added `npm run test:domain-api-split-phase5-parity`.
- Covered the Agent Listing Detail split with:
  - no static imports from action-heavy modules
  - loader-to-module mapping for each lazy service
  - wrapper-to-loader mapping for lazy actions
  - awaited call checks for actions that changed from sync-looking calls to async lazy calls
  - retained local synchronous helper checks for render-time parity
  - facade parity cases for `isSellerPortalInviteReadyAfterSignedMandate`

## Verification

```bash
npm run test:domain-api-split-phase5-parity
```

Result:

- domain API split Phase 5 parity tests passed

## Rollout Note

These are parity and regression tests, not complete browser workflow tests. They are intentionally narrow so they can run quickly during rollout. Full user-flow smoke coverage should remain separate from the import/chunk guardrail path.
