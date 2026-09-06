# Agent module Phase 5 — UI and release readiness

Phase 5 closes the agent-module remediation with keyboard-accessible table actions and an evidence-producing browser gate. The central API module remains outside this scope.

## UI changes

- Mouse-only clickable Agent and Listing table rows have been replaced with semantic buttons.
- Every converted action has an explicit accessible name.
- Keyboard focus uses a visible focus ring.
- Existing table overflow stays contained inside its scrolling region.

## Browser acceptance

The browser smoke now checks every role-appropriate route in the Phase 0 screen matrix for:

- a terminal ready, empty, permission or explicit error state;
- visible technical errors, console errors and failed requests;
- root-level horizontal overflow;
- visible interactive controls without an accessible name;
- a working keyboard focus target;
- screenshot and JSON evidence.

Run the deterministic gate from `the-it-guy/`:

```sh
npm run test:agent-phase5-ui-release
npm run verify:agent-phase5
```

Run authenticated browser acceptance against an isolated UAT environment:

```sh
AGENT_UAT_BASE_URL=https://uat.example.com \
AGENT_UAT_STORAGE_STATE=/absolute/path/to/storage-state.json \
AGENT_UAT_ROLE=principal \
npm run smoke:agent-phase5
```

Repeat browser acceptance for `agent`, `principal`, and `branch_manager`; use the Phase 2 actor checks for restricted, inactive and multi-membership data boundaries. Evidence is written under `test-results/agent-phase5/`.

The deployed-asset validator remains available separately. It is read-only and does not deploy or mutate production.
