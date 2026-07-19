# Atomic RPC conflict review — 19 July 2026

## Result

No conflicting version of `public.bridge_create_mvp_transaction(p_payload jsonb)` was found.

The current migration chain defines it only once, in `202607180046_mvp_atomic_transaction_creation_phase2a.sql`. Two reachable Git commits appear to add that same file, but both point to the identical immutable Git blob `12d0ffd8de1669870644de8512afa3de4cceaf68`; this is an integration-history artifact, not two SQL implementations.

No reachable Git history rename, removal, or alternate implementation of the function was found.

## Staging result

Staging's named RPC probe returns `PGRST202` / HTTP 404, and its generated REST API schema exposes no path or definition containing `bridge_create_mvp_transaction`. There is no deployed RPC variant to preserve or replace.

## Deployment implication

A new reconciliation migration can safely define the required `p_payload jsonb` RPC signature. It must still add and preflight the missing schema prerequisites discovered in Phase 1B, particularly `transactions.mandate_packet_id`.
