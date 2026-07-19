# Staging migration-ledger comparison — 19 July 2026

## Result

The repository contains **494** Supabase migration files. The linked staging ledger contains **431** migration versions. **63** repository migration versions are absent from staging; no staging-only versions were found.

The atomic transaction-creation migration is among the missing versions:

- `202607180046_mvp_atomic_transaction_creation_phase2a.sql`
- repository SHA-256: `61aa1e241e08bd9379b79f094f61c8f3f08c8d41d2dbb97b66b01682643349f4`
- staging ledger status: **absent**

This directly explains the missing `public.bridge_create_mvp_transaction(p_payload jsonb)` RPC recorded in the companion atomic-RPC blocker evidence.

## Comparison method

This was a read-only comparison between the numeric version prefix of every `supabase/migrations/*.sql` repository file and the linked staging ledger returned by:

```sh
npx --yes supabase@2.109.1 migration list --linked
```

No migration, transaction, notification, user, document, or database record was created, updated, or deleted. The ledger compares version IDs, not migration-file content hashes.

## Missing from staging

| Repository version range | Status |
| --- | --- |
| `202607170016–202607170031` | absent |
| `202607180001–202607180023` | absent |
| `202607180026–202607180031` | absent |
| `202607180033–202607180043` | absent |
| `202607180046–202607180052` | absent |

Staging nevertheless records the later range `202607190001–202607190006`. This is therefore an ordered-history reconciliation problem, not a safe one-file deployment.

## Decision

**Do not apply `202607180046` in isolation.** Pilot exposure remains paused. Phase 1B must classify the missing migrations and their dependencies against the actual staging schema, then prepare one safe reconciliation plan.
