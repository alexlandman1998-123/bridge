# Transaction Creation Lineage Health - Phase 6

Date: 2026-08-15

Purpose: make every transaction health and audit surface show how the
transaction was created.

## Implemented Guardrails

- Transaction health now classifies creation lineage as accepted-offer conversion, reused conversion, manual override, or missing lineage.
- Accepted-offer lineage is healthy only when the accepted offer id,
  idempotency key, transaction id, and conversion receipt are coherent.
- Manual override lineage is healthy only when the idempotency key, written
  reason, actor id, actor role, and authorisation marker are visible.
- Audit recovery flags incomplete manual override lineage as a critical issue.
- The direct Supabase RPC override path persists `transactionCreationOverride`
  metadata into `routing_profile_json`, so direct calls cannot create invisible
  override transactions.

## Release Check

Run:

```bash
node scripts/transaction-creation-lineage-health-phase6.test.mjs
node scripts/mvp-transaction-health-panel.test.mjs
node scripts/mvp-transaction-audit-recovery.test.mjs
```

Phase 6 is a read-model and health/audit hardening phase. It does not create a
new table or require a production data backfill.
