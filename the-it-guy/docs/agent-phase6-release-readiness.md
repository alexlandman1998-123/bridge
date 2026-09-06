# Agent module Phase 6 — controlled release readiness

Phase 6 produces one deterministic `GO` or `HOLD` decision from existing read-only evidence. It does not deploy, apply database migrations, seed users, change production state, or modify the central API module.

## Required evidence

- Passing Phase 2 RLS acceptance for the standard agent, principal, branch manager, restricted agent, inactive agent and multi-membership agent.
- Complete, passing performance coverage for Clients, Listings, Canvassing, transaction detail and lead detail: 20 cold and 20 warm samples per checkpoint.
- Passing Phase 5 browser acceptance for agent, principal and branch-manager roles.
- Every evidence item must be no more than 72 hours old.

Browser reports and screenshots are stored separately by role so one acceptance run cannot overwrite another.

## Run sequence

From `the-it-guy/`:

```sh
npm run verify:agent-phase6
npm run acceptance:agent-phase2-rls
npm run report:agent-performance-baseline -- --fail-on-insufficient
AGENT_UAT_ROLE=agent npm run smoke:agent-phase5
AGENT_UAT_ROLE=principal npm run smoke:agent-phase5
AGENT_UAT_ROLE=branch_manager npm run smoke:agent-phase5
npm run check:agent-phase6-release
```

Supply the UAT URL and credentials or storage state described in the Phase 5 runbook. Phase 6 reads evidence from `test-results/agent-phase2`, `test-results/agent-phase5`, and `output/agent-performance-baseline.json`.

The final receipt is written to `test-results/agent-phase6/release-readiness.json`. `GO` means the defined evidence is complete and current; it is not permission to deploy. `HOLD` lists every missing, stale or failing requirement and exits non-zero.
