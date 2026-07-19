# Append-only staging migration reconciliation plan — 19 July 2026

## Decision

Use one **new, additive reconciliation migration** for the controlled MVP transaction-creation path. Do not rewrite the migration ledger and do not replay the 63 skipped historical migrations.

The repository history is frozen at migration-tree object `ab2e480169845a8b315fc1c4b56a2942721a1b1d`. The reconciliation migration must receive a new version later than `20260719130913`, the current highest repository and staging version.

## Non-negotiable rules

- Do not edit, delete, rename, re-date, squash, or individually push historical migrations.
- Do not write to the Supabase migration ledger or mark versions as applied.
- Keep the new migration additive, idempotent and transactional where PostgreSQL allows it.
- If a check fails, stop and issue a later forward correction migration. Never rewrite applied SQL.

## What the new migration will reconcile

Only the MVP atomic-creation contract:

- `transactions.mandate_packet_id`, which the original RPC needs but does not create
- the ten transaction fields still missing from staging
- transaction idempotency index
- `transaction_participant_requirements`
- the participant, document and workflow seed helpers
- `bridge_create_mvp_transaction(p_payload jsonb)` and explicit privilege hardening for it and every security-definer helper

It deliberately excludes unrelated historical gaps, including calendar and document-generator work.

## Mandatory preflight before authoring

1. Re-read staging's ledger and allocate a monotonic new version.
2. Inspect the live constraints and indexes that the seed helpers would use as `ON CONFLICT` targets.
3. Check legacy data for duplicates before adding any required uniqueness.
4. Check types/defaults of all objects the RPC consumes.
5. Confirm the target RPC remains absent and no conflicting overload exists.
6. Capture a before-state schema and ledger audit.

## Deployment and recovery

After the migration, the named RPC must resolve; an empty test payload should produce a validation/access response rather than `PGRST202`. Only then may the authenticated staging smoke transaction begin.

If verification fails, exposure remains paused. The fix is a new forward migration—never deletion or ledger manipulation.
