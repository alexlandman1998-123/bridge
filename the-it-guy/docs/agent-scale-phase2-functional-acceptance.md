# Agent scale readiness — Phase 2 functional acceptance

Phase 2 adds repeatable click-through coverage for safe shared Agent actions without creating, editing, sending or deleting customer data.

## Automated safe scenarios

- Quick Create opens.
- Quick Create → Lead opens its dialog.
- Transactions navigation reaches the canonical route and survives refresh.
- Pipeline → Leads navigation reaches the canonical route and survives refresh.
- Settings navigation reaches the canonical route and survives refresh.
- Enquiries search accepts and retains the typed filter value during the interaction.
- Unexpected console errors and failed requests fail the run.

The runner also captures an inventory of the final screen's visible controls, classifying navigation, local form controls, disabled controls, safe interactions and actions with potential mutation or external effects.

## Placeholder boundary

Existing Agent-management placeholders are explicitly registered in `config/agent-scale-phase2-action-matrix.json`. Adding another `openPlaceholder(...)` action fails the repository contract until it is deliberately classified. Phase 3 will remove, implement or visibly disable these registered placeholders.

## Commands

Run deterministic contracts and all earlier scale gates:

```sh
npm run verify:agent-scale-phase2
```

Run local safe interaction acceptance against a Vite server started with `VITE_ENABLE_DEV_AUTH_BYPASS=true`:

```sh
AGENT_UAT_BASE_URL=http://127.0.0.1:5173 \
AGENT_UAT_DEV_BYPASS=true \
npm run smoke:agent-scale-phase2
```

For staging, supply an isolated authenticated storage state or controlled credentials. Mutation, messaging, import/export and destructive actions are intentionally not clicked by this runner; those require dedicated disposable fixtures and explicit staging authorisation.
