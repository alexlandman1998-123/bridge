# Supabase RLS Phase 8 - Production Readiness Gate

Generated: 2026-08-14

## Status

Phase 8 is production-ready because Phase 7 staging smoke and advisor evidence is complete.

## Purpose

Phase 8 prevents the RLS package from being promoted to production until staging proves the policy design works against real Supabase behavior:

- Phase 7 staging evidence must be complete and reviewer-approved.
- RLS must be verified on all eight Phase 0 tables in staging.
- Browser/authenticated direct-write probes must fail where expected.
- Backend service-role or controlled RPC workflows must pass.
- Supabase advisor evidence must show the original eight RLS-disabled public tables are resolved.

## Production Guard

Do not run against production in Phase 8.

This phase does not execute SQL. It records that production target `isdowlnollckzvltkasn` is ready for an explicit production apply step after staging project `vaszuxjeoajeuhlcnzzf` completed smoke and advisor evidence.

## Artifacts

- `docs/supabase-rls-phase-8-production-readiness.json`
- `docs/production-evidence/supabase-rls-phase-8-production-readiness.json`
- `scripts/rls-phase8-production-readiness.test.mjs`
- `npm run test:rls-phase8-production-readiness`

## Blocking Reasons

- None. Staging evidence is complete.

## Production Gates

- Phase 7 staging evidence status is `STAGING_EXECUTION_COMPLETE`.
- All Phase 7 global evidence flags are true.
- Every Phase 1-5 staging evidence row marks SQL applied and RLS enabled.
- Every Phase 1-5 staging evidence row has passing negative browser write probes.
- Every Phase 1-5 staging evidence row has passing required workflow smokes.
- Production evidence includes rollback, pre-apply advisor, post-apply advisor, and smoke attachments.

## Verification

Passing local verification:

```bash
npm run test:rls-phase8-production-readiness
```

This command also executes the Phase 7 staging execution contract, which executes Phase 6 and the Phase 1-5 contract tests.

## Remote Apply Status

- Staging: execution complete.
- Production: ready and not applied.
