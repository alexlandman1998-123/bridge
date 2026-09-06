# Agent scale Phase 5 — performance hardening

Phase 5 adds Calendar to the existing agent route-performance contract and fixes an immediate duplicate initial reload. It deliberately leaves API redesign out of scope.

## Readiness checkpoints

- `shell_ready`: Calendar route component mounted.
- `core_ready`: organisation context and the visible appointment range are loaded; the blocking skeleton has gone.
- `settled`: next task after core paint, with request count, duplicate count, slow-request count, transferred bytes, and the five slowest application requests.

Cold samples use navigation start. Warm samples use the router transition trace. Each checkpoint and temperature requires at least 20 deployed samples. Missing evidence produces `INSUFFICIENT_DATA`, never a pass.

## Calendar budgets

| Measure | p95 budget |
| --- | ---: |
| Core ready | 2,500 ms |
| Settled | 5,000 ms |
| Application requests | 8 |
| Duplicate application requests | 0 |
| Requests slower than 1 second | 0 |
| Transferred bytes | 400,000 |

Run `npm run verify:agent-scale-phase5` for the deterministic code gate. Run `npm run acceptance:agent-scale-phase5` only against a configured deployed/staging telemetry dataset. The acceptance command requires 20 cold and 20 warm samples and fails closed on missing or breached evidence.
