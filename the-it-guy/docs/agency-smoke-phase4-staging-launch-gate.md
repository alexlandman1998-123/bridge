# Agency Smoke Phase 4 — Staging Launch Gate

Phase 4 promotes the agency smoke suite from local regression coverage to a fail-closed staging launch gate.

## Launch command

```bash
npm run test:agency-launch-gate
```

The command stops on the first failure and includes:

1. RLS and manual-intervention contract audit.
2. Seller, buyer, and listing workflow checks.
3. Browser action smoke coverage.
4. Approved-staging PostgREST schema and authenticated RLS probes.
5. Unrelated-user membership and protected-table isolation probes.

## Required environment

The gate reads `.env` and `.env.staging.local` and requires:

- `SUPABASE_URL` or `VITE_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_KEY`, or `SUPABASE_ANON_KEY`
- `AGENCY_RUNTIME_AGENT_EMAIL` and `AGENCY_RUNTIME_AGENT_PASSWORD`, or the staging internal equivalents
- `AGENCY_RUNTIME_UNRELATED_EMAIL` and `AGENCY_RUNTIME_UNRELATED_PASSWORD`

The runtime scripts refuse to certify any Supabase project other than the approved staging project.

## Isolation fixture behaviour

The isolation runner reuses a configured unrelated QA user when it already exists. It does not recreate or update that account. It verifies that the user has zero organisation memberships before querying protected Agency tables as that user.

If the Auth Admin user-list endpoint is unavailable, the runner may resolve the configured fixture through its own credentials. The membership and RLS probes remain unchanged and fail closed on visible protected rows, missing credentials, failed authentication, or an unexpected project.

## Passing result

A launch candidate passes only when the umbrella summary reports five passing phases and zero failures. Runtime `BLOCKED` and `CRITICAL` findings fail the command.
