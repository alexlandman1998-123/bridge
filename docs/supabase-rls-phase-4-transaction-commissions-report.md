# Supabase RLS Phase 4 - Transaction Commissions

Generated: 2026-08-14

## Status

Phase 4 is implemented locally and has not been applied to staging or production.

## Scope

Phase 4 covers the financial transaction commission snapshot table classified in Phase 0:

- `public.transaction_commissions`

## Implementation

Migration:

- `supabase/migrations/20260814164526_rls_phase4_transaction_commissions.sql`

App path:

- `the-it-guy/src/lib/api.js`

Contract test:

- `scripts/rls-phase4-transaction-commissions.test.mjs`
- `npm run test:rls-phase4-transaction-commissions`

## Controls

### Table Access

- Enables row level security.
- Removes `public`, `anon`, and broad authenticated table grants.
- Re-adds only authenticated `select`.
- Preserves `service_role` table access.
- Adds no authenticated direct insert, update, or delete policy.

### Read Policy

Authenticated reads are allowed only when one of these predicates passes:

- Organisation admin for the commission row organisation.
- Active organisation member who is the assigned agent by user id or email.
- Transaction participant with `view_transaction`.

### Write Path

Direct browser writes are blocked. Commission snapshot writes now go through:

- `public.bridge_upsert_transaction_commission_snapshot(...)`

The RPC requires authentication and allows writes only for:

- Organisation admins.
- Transaction participants with `edit_core_transaction`.
- Active organisation members who are the assigned agent, only for `draft` or `projected` snapshots.

The app commission snapshot persistence path now calls this RPC first and only falls back to the legacy direct table write when the RPC is absent.

## Verification

Passing local verification:

```bash
npm run test:rls-phase1-internal-controls
npm run test:rls-phase2-workspace-hierarchy
npm run test:rls-phase3-transaction-read-models
npm run test:rls-phase4-transaction-commissions
```

## Apply Gates

Before recording this phase as applied, run it against staging first and capture evidence for:

- Supabase advisor no longer reports RLS disabled on `transaction_commissions`.
- Anon cannot read commission rows.
- Principal/admin dashboard can still read organisation commission rows.
- Assigned agent can read their own commission rows.
- Non-assigned active members cannot read other agents' commission rows unless they are transaction participants.
- Transaction participant with `view_transaction` can read that transaction's commission row.
- Direct authenticated insert/update/delete on `transaction_commissions` is blocked.
- `bridge_upsert_transaction_commission_snapshot(...)` can write for an organisation admin.
- `bridge_upsert_transaction_commission_snapshot(...)` can write for an authorized assigned agent only for `draft` or `projected` snapshots.
- Unauthorized users cannot write through the RPC.

Production should only follow after staging evidence passes.
