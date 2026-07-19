# Atomic migration creation contract — 19 July 2026

## What `202607180046` creates or defines

- 17 additive fields on `transactions`
- the partial unique idempotency index `transactions_mvp_creation_idempotency_uidx`
- `transaction_participant_requirements`
- three security-definer bootstrap helpers for participants, documents and workflow lanes
- `bridge_create_mvp_transaction(p_payload jsonb)`
- an authenticated execute grant for the atomic RPC, after revoking public access to that RPC

Within the RPC, it creates or returns an idempotent transaction, links the lead and accepted offer, then seeds participants, documents and workflow lanes.

## What it does not create or harden

- `transactions.mandate_packet_id`, despite inserting into it
- RLS or policies for `transaction_participant_requirements`
- explicit revocation of public execution from the three security-definer helper functions

The first omission prevents the RPC from running on staging. The privilege omissions must be corrected in the new reconciliation migration before pilot exposure.

This is a source review only; the historic migration was not applied.
