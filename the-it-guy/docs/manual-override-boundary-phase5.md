# Manual Override Boundary - Phase 5

Date: 2026-08-15

Purpose: keep direct buyer-lead transaction creation as an exception path, not
the normal workflow.

## Implemented Guardrails

- Direct lead conversion without `accepted_offer_id` requires
  `allowDirectLeadConversion: true`.
- The direct conversion path also requires a written
  `transactionCreationOverrideReason` / `transaction_creation_override_reason`.
- The actor must be identifiable and authorised as principal, owner, manager, or
  admin.
- Ordinary agents cannot use the manual override boundary to skip the accepted
  offer.
- Override-created transactions carry override reason, actor id, actor role, and
  `transactionCreationOverride` audit metadata through the runtime payload.
- The Supabase `bridge_create_mvp_transaction` RPC enforces the same exception
  boundary for direct calls: no accepted offer means a written reason and an
  authorised organisation role are required.
- Accepted-offer conversions remain unaffected and do not require override
  metadata.

## Release Check

Run:

```bash
node scripts/transaction-override-boundary-phase5.test.mjs
node scripts/accepted-offer-transaction-boundary-phase3.test.mjs
node scripts/mvp-atomic-transaction-creation.test.mjs
```

Phase 5 does not add a new database column. Override metadata is carried in
runtime results and the persisted routing profile. A later schema phase can
promote this into dedicated transaction audit columns or an append-only override
table.
