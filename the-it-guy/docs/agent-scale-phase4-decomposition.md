# Agent scale readiness — Phase 4 decomposition

Phase 4 begins controlled decomposition of the oversized operational screens without changing their behaviour or the central API architecture.

## Extracted boundary

The reusable Agent workspace presentation layer now lives in `src/components/agents/AgentWorkspaceUi.jsx`. It owns:

- management cards and unavailable-action presentation;
- tab section shells;
- workspace cards and KPI cards;
- detail rows, empty states and locked Agent scope indicators.

`Agents.jsx` remains the route orchestrator and domain workflow owner. This extraction removes duplicated visual responsibility from the route and gives later workspace-tab extraction a stable component boundary.

## Growth guardrails

`config/agent-scale-phase4-decomposition-budgets.json` establishes source-line ceilings for the five known hotspots and production chunk ceilings for the four oversized route chunks. The ceilings are intentionally close to the current baseline. If a ceiling is reached, extract another coherent module; do not raise it as routine maintenance.

## Verification

```sh
npm run verify:agent-scale-phase4
```

This runs every earlier scale gate, the production build, route chunk budgets and the extraction ownership contract.

## Remaining decomposition order

1. Extract Agent workspace modal/forms and tab bodies from `Agents.jsx`.
2. Split `AgentListingDetail.jsx` by listing workflow area.
3. Split `AgencyPipelinePage.jsx` into list, overview and detail route modules.
4. Split `AttorneyTransactionDetail.jsx` by transaction workspace domain.
5. Partition global CSS into route-owned layers.

The phase establishes and verifies the decomposition boundary; it does not claim the remaining hotspot files are already small.
