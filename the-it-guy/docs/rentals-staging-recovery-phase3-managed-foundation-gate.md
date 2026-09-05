# Rentals staging recovery — Phase 3 managed-foundation gate

Phase 3 introduces a repository-enforced pre-authoring gate. It does not create a migration, connect to Supabase, modify a ledger, or apply schema changes.

Run the contract test:

```sh
node src/services/rentals/__tests__/rentalFoundationMigrationPlan.test.js
```

Report current recovery readiness:

```sh
node scripts/rentals-staging-recovery-phase3-plan.mjs
```

The report reads [`config/rentals-staging-recovery-evidence.json`](../config/rentals-staging-recovery-evidence.json). It remains blocked until every item has `confirmed: true` plus a non-secret reference and timestamp:

1. production migration-ledger export;
2. production rental catalog report;
3. staging backup/snapshot or disposability confirmation;
4. staging deployment and external-side-effect freeze confirmation.

Even when all evidence is attached, the gate only permits **managed migration authoring**. `applyAllowed` is deliberately always `false`; database application belongs to a separately authorised later phase.
