# Agent Phase 0 — Release Safety Baseline

## Scope

Phase 0 freezes the supported Agent surface and makes regressions reproducible. It does not change API architecture or repair application behaviour.

The canonical screen, role and performance contract is `config/agent-phase0-screen-matrix.json`.

## Required screen states

Every Agent screen must deliberately implement and visually distinguish:

1. Loading
2. Ready
3. Genuine empty
4. Permission denied
5. Error with retry
6. Retrying

A failed read must never be presented as a zero count or genuine empty state.

## Role acceptance matrix

Browser acceptance must cover standard Agent, principal, branch manager, restricted Agent, inactive Agent and an Agent with multiple memberships. The active organisation must be visible in the captured evidence and records from another organisation must never appear.

## Safe browser baseline

Use an isolated UAT organisation. The runner only navigates and captures evidence; it does not submit forms, create records, send communications or trigger destructive actions.

Authenticate using a saved Playwright storage state:

```sh
AGENT_UAT_BASE_URL=https://uat.example.test \
AGENT_UAT_STORAGE_STATE=/secure/path/agent-state.json \
AGENT_UAT_ROLE=agent \
npm run smoke:agent-phase0
```

Alternatively provide `AGENT_UAT_EMAIL` and `AGENT_UAT_PASSWORD`. For local-only UI inspection, start Vite with `VITE_ENABLE_DEV_AUTH_BYPASS=true` and run with `AGENT_UAT_DEV_BYPASS=true`; local bypass does not prove RLS correctness.

Evidence is written to `test-results/agent-phase0/`, including one screenshot per screen and `baseline.json` with state, console failures, request failures and timings.

## Release gate

Run:

```sh
npm run verify:agent-phase0
```

The CI-safe gate validates the screen contract, existing performance baseline, retired-surface protections, targeted Agent lint and the production build. The credentialed browser smoke is intentionally separate and must be attached to the release candidate as UAT evidence.

Release approval requires:

- `verify:agent-phase0` passing.
- Browser evidence for Agent and principal roles.
- No primary request failures or severe console errors.
- No technical database error shown to users.
- Meaningful-ready timings compared with the budgets in the screen matrix.
- A named reviewer signing off the role matrix and screenshots.
