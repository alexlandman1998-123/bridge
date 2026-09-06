# Agent scale readiness — Phase 3 legacy and placeholder UI

Phase 3 removes misleading Agent-management interactions while preserving the working canonical workflows.

## Working workflows retained

- Edit Agent profile and branch.
- Edit Agent permissions and role.
- Edit commission structure, override and target.
- Navigate to transactions, listings, leads and calendar.

The modal launcher is now named `openManagementModal` and is restricted to profile, permissions and commission modes.

## Unsupported actions contained

- Message and Call are visibly disabled with capability-specific explanations.
- Assign Deal and Assign Listing are visibly disabled.
- Notification preferences and team allocation are visibly disabled.
- Deactivate and Remove are visibly disabled instead of opening confirmation dialogs that ultimately performed no change.
- Deactivate was removed from the working More menu.
- The generic placeholder modal and its “nothing changed” confirmation path were removed.

## Legacy ownership

The canonical Agent directory and workspace remain `/agency/agents` and `/agency/agents/:agentId`. Old bookmark routes remain redirect-only and the retired reporting page remains outside the application graph.

## Verification

```sh
npm run verify:agent-scale-phase3
```

The gate fails if an interactive placeholder returns, a working management modal disappears, a no-op transaction creation handler returns, or the canonical route ownership changes.
