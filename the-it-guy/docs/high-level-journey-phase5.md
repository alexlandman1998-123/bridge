# Phase 5 — participant journey presentation

Local implementation, not deployed.

- Shared summary views use OTP, Finance, Transfer, Lodged, Registered with the
  Phase 3 explicit-outcome rules. No percentage or stage-index completion is inferred.
- Detailed journey views retain the same legal tasks and recipient-safe conversation.
- The authorised rollup supplies commercial milestone outcomes. Shared legal
  outcomes are recomputed from the exact legal reader snapshot shown in detail.
- Reopening a task removes completion across the shared summary presentations.
- No new subscriptions, progress storage, permission grants, document exposure,
  client messages, or notification side effects are introduced.

## Deployment prerequisite

`20260908181335_shared_journey_active_plan_manifest.sql` adds active-plan status
and lane keys to the existing private reader. Public authorisation wrappers remain
unchanged. Legacy readers do not establish legal applicability: the summary shows
Not available until the explicit manifest is present. Detailed tasks remain visible.

The manifest and `20260908183116_shared_journey_commercial_facts.sql` migrations
have now been executed on staging and in isolated PGlite tests. They are not applied
to production. Live attorney/buyer reads and denial checks passed; valid seller-session
and complete browser transition acceptance remain outstanding.

## Known access limitation

The shared reader now includes allowlisted commercial status facts from normalised
workflow steps, with the same revision as legal outcomes. All recipient wrappers,
including the seller-session wrapper, use it. No documents, amounts, notes or raw
workflow table access are added. Missing saved facts remain Not available. The
application prefers these facts over legacy rollups, including when work is reopened.
Valid seller-session parity still requires a live session test.

## Verification

`node scripts/high-level-journey-audiences.test.mjs` covers five audience renderings,
summary/detail separation, reopening, missing facts, manifest/revision guards and
private-note exclusion. Existing rule, integration, placement, shared-view and
rollup tests were also run. These are local automated checks, not signed-in live
cross-role verification.
