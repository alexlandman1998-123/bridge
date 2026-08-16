# Accepted Offer Transaction Boundary - Phase 3

Date: 2026-08-15

Purpose: harden the normal `Accepted Offer -> Transaction` boundary so a buyer
lead cannot accidentally become or reuse the wrong transaction.

## Implemented Guardrails

- Accepted-offer conversion reuses transactions only by `accepted_offer_id`.
- Broad buyer-lead duplicate reuse remains available only for explicit direct
  lead conversion paths that do not carry an accepted offer.
- Accepted-offer transaction identity lookups include continuity fields needed
  for receipt verification: `creation_idempotency_key`, `buyer_contact_id`, and
  `assigned_agent_id`.
- Reused accepted-offer conversions now assert the same conversion receipt shape
  as freshly created conversions.
- A reused transaction is blocked if it cannot prove matching
  `accepted_offer_id`.
- A reused transaction is blocked if it cannot expose the transaction creation
  idempotency key.
- Linked `offer.transaction_id` reuse fetches the persisted transaction identity
  row before reporting success.

## Release Check

Run:

```bash
node scripts/accepted-offer-transaction-boundary-phase3.test.mjs
node scripts/mvp-accepted-offer-conversion-receipt.test.mjs
node scripts/mvp-atomic-transaction-creation.test.mjs
```

The UI may report conversion success only after the service returns a persisted
transaction id and a ready conversion receipt.
