# Bond application Finance — Phase 8 stabilisation

Phase 8 is the production sign-off gate. It prevents compatibility fallback removal until real operational evidence proves the secured application-scoped RPC is stable.

## Sign-off criteria

- Seven-day default observation window
- At least 100 Finance workspace telemetry events
- Traffic on at least three distinct days
- At least one populated canonical bond application workspace observed
- Zero canonical identity failures
- Compatibility fallback rate at or below 1%
- Refresh-failure rate at or below 2%

The possible decisions are:

- `SIGN_OFF`: all criteria pass; fallback retirement may be planned as a separate controlled change.
- `HOLD`: evidence is incomplete or a non-critical threshold fails; fallback remains enabled.
- `ROLLBACK`: canonical identity failures occurred; stop rollout and investigate application linkage.

## Run

Run only in a server-side environment:

```sh
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run certify:bond-application-finance -- --window=10080 --strict
```

The live project currently returns `HOLD` because it has no Finance workspace traffic or populated canonical bond application evidence. Phase 8 therefore preserves compatibility mode by design.

Supabase Security and Performance Advisors report no findings tied to the stabilisation RPC.
