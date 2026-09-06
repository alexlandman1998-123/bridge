# API-split Phase 5: transaction core

`createTransactionFromWizard` now delegates its pure pre-write validation to `src/core/transactions/transactionCreationInput.js`. This is the first transaction-core extraction and it deliberately happens before profile lookup, partner routing, buyer creation, or a database mutation.

The next extractions must preserve that sequence:

1. Pure validation and normalization.
2. Read-only resolution of organisation, buyer, settings, and routing.
3. Core transaction persistence.
4. Recoverable post-create setup steps recorded through `transactionCreationLifecycle`.

Do not combine these steps into a new hidden orchestration function. Each needs a focused contract test and explicit failure/rollback policy.

Verify with:

```sh
node src/core/transactions/__tests__/transactionCreationInput.test.js
node src/core/transactions/__tests__/transactionCreationLifecycle.test.js
node scripts/api-split-phase1-inventory.test.mjs
```
