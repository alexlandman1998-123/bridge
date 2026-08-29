# Bond application Finance — Phase 7 monitoring

Phase 7 monitors the controlled cutover without storing or returning buyer, agent, transaction, application, route, or workspace identifiers.

Initial live status on 28 August 2026: `NO_TRAFFIC` over 60 minutes, with zero fallback, refresh-failure, or identity-invalid events.

## Status rules

- `HEALTHY`: RPC contract is valid, no identity failures, fallback rate below 5%, and refresh-failure rate below 10%.
- `NO_TRAFFIC`: no Finance workspace events occurred in the selected window. This is healthy but does not prove a populated application journey.
- `DEGRADED`: compatibility fallback reaches 5% or refresh failures reach 10%.
- `BLOCKED`: the monitor contract is unavailable or invalid, or any canonical identity failure is recorded. Rollback to the compatibility path is recommended.

## Run

Use a server-side environment only. Never expose the service-role key to browser code.

```sh
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run monitor:bond-application-finance -- --window=60 --strict
```

The window is clamped between 5 minutes and 7 days. Without `--strict`, degraded state is reported but does not return a failing exit code; blocked state always fails.

## Response

1. For `DEGRADED`, confirm RPC availability, inspect Realtime health, and compare fallback and refresh-failure events over a second window.
2. For `BLOCKED`, preserve the client compatibility path, stop further rollout, validate canonical application identity linkage, and re-run the Phase 1–7 verifier.
3. Re-run Supabase Security and Performance Advisors after every database change.
