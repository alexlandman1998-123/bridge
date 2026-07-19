# Atomic transaction migration classification — 19 July 2026

## Decision

`202607180046_mvp_atomic_transaction_creation_phase2a.sql` is **genuinely absent from staging**. It is not a harmless missing-ledger entry, and no later migration replaces its atomic transaction RPC.

It is also **not safe to apply unchanged** to staging. The migration's RPC inserts into `public.transactions.mandate_packet_id`, but the migration does not create that column and staging does not have it. The RPC would therefore fail when invoked.

The appropriate next step is a new, reviewed, additive reconciliation migration — not a direct push of the historical file.

## What staging already has

- `transaction_participants`, `transaction_required_documents`, and `transaction_workflow_lanes`, including all columns used by the respective bootstrap helpers
- lead and offer conversion fields
- buyer insertion fields and the underlying transaction fields unrelated to the atomic additions
- `bridge_is_active_member(uuid)`
- seven of the transaction fields added by the historical migration, from earlier compatibility work

## What staging lacks

- `public.bridge_create_mvp_transaction(p_payload jsonb)` (`PGRST202` / HTTP 404)
- `public.transaction_participant_requirements` (`PGRST205` / HTTP 404)
- ten transaction fields added by the migration, including `creation_idempotency_key`, `property_tenure`, `routing_profile_json`, `otp_packet_id`, and `commission_snapshot_id`
- `public.transactions.mandate_packet_id`, which the RPC requires but the historical migration does not add

## Implication

Do not run the historic migration by itself and do not resume pilot exposure. Phase 1C should construct one idempotent reconciliation change with explicit preflight checks, then validate it in staging before any real lead-to-registration transaction is attempted.
