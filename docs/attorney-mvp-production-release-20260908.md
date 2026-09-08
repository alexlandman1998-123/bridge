# Attorney MVP production release — 8 September 2026

User authorised production release of the attorney edits. Website/home-search work is excluded.

## Preflight

- Source changes already on origin/main at `938036bb`; new event-visibility migration and acceptance records remain to push.
- Production: `isdowlnollckzvltkasn`; staging-bound preview must never be promoted.
- Recovery gate: RECOVERY_LOCKED. Completed physical backup `1609926932`, 2026-09-08 03:03:53.500 UTC. Existing accepted isolated restore evidence remains in the recovery evidence document.
- Phase 5: zero duplicate migration timestamps; historical drift remains, so no broad push or include-all.
- All three release versions initially absent from production ledger. Permission/stage helper prerequisites present. Existing task statuses are compatible with expanded status check.
- Function definitions/ACLs captured in attorney-mvp-production-function-prestate.json. Original task status constraint allows not_started/in_progress/completed/blocked/waiting; event scope allows shared/internal.

## Scoped recovery plan

If behavior checks fail before traffic uses new outcomes, restore the captured lifecycle function definition and use the previous production frontend. Do not restore public execution of the internal lifecycle helper. Leave additive outcome/event constraints in place to preserve any newly recorded outcomes; do not delete or rewrite user data. Disable new v2/v3/reconciliation RPC execution if required while restoring the prior UI. Function removal or narrower constraints require a separate check for callers and new outcome data. No full-database restore is part of routine rollback.

## Verification scope

Staging browser completed/reopened one authorised demo task: 70% → 73% → 70%; Work/header/dashboard agreed, four professional-only and zero client-visible events. Local profile/outcome and isolated SQL tests passed. Full multi-role/profile live certification and refresh-latency work remain outstanding; this release does not claim those are complete.

## Production execution

Applied each reviewed file individually through `supabase db query --linked --project-ref isdowlnollckzvltkasn --file …`:

- 20260908071547: atomic task progress and lifecycle calculation.
- 20260908073924: discretion outcomes and plan reconciliation.
- 20260908091504: explicit event visibility compatibility.

Verified installed constraints, authenticated-only RPC execution, revoked public helper execution, and unauthenticated mutation rejection. No production task/assignment was used for a write smoke test. Security advisors captured; existing unrelated findings remain. Original task statuses were compatible; no task data was rewritten.

CLI migration repair stalled while opening its database connection and was terminated. After schema verification, the exact three versions/names and executed file contents were recorded through the management SQL connection, insert-only with conflict protection. No historical ledger rows were rewritten and no migrations replayed.

Production frontend was already READY at deployment `dpl_72mNXMCBtekH6xo8TJE7LRt6f7TY`, commit `938036bb6a4c1aae9c762590149d4ad42c7e75e6`. Its public release manifest confirms production Supabase origin `https://isdowlnollckzvltkasn.supabase.co`. No staging preview was promoted. Remaining release files are pushed separately.
