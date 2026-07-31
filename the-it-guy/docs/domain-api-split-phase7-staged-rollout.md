# Domain API Split Phase 7: Staged Rollout

Date: 2026-07-31

## Scope

Phase 7 defines the staged rollout path for the `agent-listing-detail` API split.

This phase does not add a runtime feature flag. The old eager-import path would reintroduce the heavy shared API dependency, so rollback is handled by redeploying the previous application version.

## What Changed

- Added `config/domain-api-split-phase7-agent-listing-detail-rollout.json`.
- Added `scripts/domain-api-split-phase7-rollout.test.mjs`.
- Added `npm run test:domain-api-split-phase7-rollout`.
- Bound rollout readiness to the Phase 6 domain audit gate.
- Kept Agent Listing Detail report-only in the global chunk audit.

## Required Preflight

Run before staging or production rollout:

```bash
npm run build
npm run test:domain-api-split-phase6-gate
npm run test:domain-api-split-phase7-rollout
npm run test:domain-import-inventory
npm run test:domain-api-chunks
npm run test:performance-budget
```

## Stages

1. `local_preflight`
   - Audience: engineering.
   - Promote only if the fresh build, Phase 6 gate, and performance budget pass.
   - Rollback: do not deploy; fix the failed source, audit, or budget layer locally.

2. `staging_internal`
   - Audience: internal agent and principal accounts.
   - Verify Agent Listing Detail loads without a static `api-*.js` route dependency.
   - Exercise listing overview, seller onboarding preview, offers list, interested leads, and show-day sections.
   - Rollback: Redeploy the previous application version. No database rollback is required.

3. `production_canary`
   - Audience: one low-risk agency or internal production agency account.
   - Exercise one seller-onboarding action, one offer action, and one show-day action.
   - Watch route-load errors and lazy dynamic-import failures.
   - Rollback: Redeploy the previous application version and keep Agent Listing Detail report-only.

4. `production_full`
   - Audience: all agent and principal users.
   - Promote only after canary completes without blocking incidents.
   - Rollback: Redeploy the previous application version.

## Stop Conditions

Stop rollout if any of these occur:

- Phase 6 gate fails.
- Tracked heavy static imports are reintroduced.
- The built Agent Listing Detail route statically depends on `api-*.js`.
- Entry gzip exceeds 140 KB or static script gzip exceeds 750 KB.
- Route-load errors or lazy-action import failures increase materially during staging or canary.

## Monitoring

Watch these signals during staging and canary:

- Agent Listing Detail route-load JavaScript errors.
- Dynamic import failures for private listing, agency pipeline, buyer lifecycle, listing offer, lead, seller portal, seller document, or show-day services.
- Seller onboarding send failures.
- Offer invite or offer status action failures.
- Show-day lead capture failures.
- Route initial JS payload and static script dependency gzip.

## Enforcement Boundary

Do not set `enforceClean: true` for `agent-listing-detail` yet.

The Phase 6 gate proves the static route graph is clean:

- tracked heavy static imports: 0
- static API route dependencies: 0
- static API route gzip: 0 B

The stricter preload-reference audit still reports `api-*.js` because click-time lazy services depend on API-backed modules. That is the next deeper service-split boundary, not a Phase 7 rollout blocker.
