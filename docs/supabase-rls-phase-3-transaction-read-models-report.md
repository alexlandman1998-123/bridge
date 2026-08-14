# Supabase RLS Phase 3 - Transaction Read Models

Generated: 2026-08-14

## Status

Phase 3 is implemented locally and has not been applied to staging or production.

## Scope

Phase 3 covers the transaction-scoped read/state tables classified in Phase 0:

- `public.transaction_document_requirements`
- `public.transaction_lifecycle_workflows`

## Implementation

Migration:

- `supabase/migrations/20260814164152_rls_phase3_transaction_read_models.sql`

Contract test:

- `scripts/rls-phase3-transaction-read-models.test.mjs`
- `npm run test:rls-phase3-transaction-read-models`

## Controls

### Shared Controls

- Enables row level security.
- Removes `public`, `anon`, and previous broad authenticated table grants.
- Re-adds only authenticated `select`, `insert`, and `update`.
- Preserves `service_role` table access.
- Adds no authenticated delete policy.

### `public.transaction_document_requirements`

- Transaction participants with `view_documents` or `view_transaction` can read rows for that transaction.
- Resolver writes are limited to transaction coordinators/document workflow roles:
  - `edit_core_transaction`
  - `manage_transfer_workflow`
  - `manage_bond_workflow`
  - `upload_transfer_docs`
  - `upload_bond_docs`
- Update uses both `USING` and `WITH CHECK`.

### `public.transaction_lifecycle_workflows`

- Transaction participants with `view_transaction` can read lifecycle state for that transaction.
- Direct lifecycle writes are limited to transaction coordinators/workflow managers:
  - `edit_core_transaction`
  - `manage_transfer_workflow`
  - `manage_bond_workflow`
- Update uses both `USING` and `WITH CHECK`.

## Verification

Passing local verification:

```bash
npm run test:rls-phase3-transaction-read-models
```

The Phase 1 and Phase 2 contracts also remain green.

## Apply Gates

Before recording this phase as applied, run it against staging first and capture evidence for:

- Supabase advisor no longer reports RLS disabled on `transaction_document_requirements` and `transaction_lifecycle_workflows`.
- A transaction participant can read document requirements for their transaction.
- A transaction participant cannot read document requirements for an unrelated transaction.
- A permitted transaction coordinator/document workflow role can run the document requirement resolver/upsert path.
- A participant without document/workflow write permission cannot insert or update requirement rows.
- A transaction participant can read lifecycle workflow state for their transaction.
- A permitted transaction coordinator/workflow manager can create or advance lifecycle state.
- A participant without lifecycle write permission cannot insert or update lifecycle state.
- Authenticated hard delete remains blocked for both tables.

Production should only follow after staging evidence passes.
