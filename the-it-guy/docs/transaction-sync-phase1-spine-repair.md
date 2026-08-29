# Transaction sync Phase 1 — spine repair

Phase 1 establishes the transaction as the shared operational spine without changing client visibility or legacy lifecycle fields.

## What it repairs

- Missing transaction subprocess lanes and template steps.
- Invalid subprocess `current_stage` pointers, using the first active/open step as the deterministic replacement.
- Missing canonical workflow instances, workflow steps, evidence references, and transaction rollups.
- Missing professional-shared transaction and progressed-lane baselines through the existing Phase 6 reconciliation RPC.
- Operational checklist baselines through the existing subprocess synchronisation path.

Phase 1 does **not** rewrite `stage`, `current_main_stage`, client-visible progress, signed evidence, comments, notifications, or role permissions. Canonical-to-legacy lifecycle cutover belongs to a later phase.

## Safe operation

The command defaults to read-only plan mode and excludes demo transactions:

```sh
npm run sync:transaction-phase1 -- --limit=25
```

Scope a canary to one transaction:

```sh
npm run sync:transaction-phase1 -- --transaction-id=<uuid>
```

Apply is deliberately gated. It requires an explicit environment and exact Supabase project reference. Production additionally requires `--confirm-production`:

```sh
npm run sync:transaction-phase1 -- --apply --environment=production \
  --confirm-project-ref=<project-ref> --confirm-production --transaction-id=<uuid>
```

Every applied transaction is re-read after repair. The command exits non-zero if a write fails or any scoped spine gap remains. Re-running the same scope is supported: upserts, existing model synchronisers, and reconciliation conflict keys make the repair idempotent.

## Rollout sequence

1. Run the full plan and retain the JSON output.
2. Apply one non-demo canary transaction; verify `remainingGapCount=0`.
3. Apply batches of 10, then 25, comparing gap and failure counts after each batch.
4. Run the existing cross-module audit and require zero missing canonical rollups, zero missing active subprocess coverage, zero missing shared baselines, and zero progressed lanes without professional-shared progress.
5. Keep the progress rollout in `audit_only`; Phase 1 does not enable automatic repair or client exposure.
