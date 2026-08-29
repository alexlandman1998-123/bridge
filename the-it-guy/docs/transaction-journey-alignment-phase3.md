# Transaction Journey Alignment: Phase 3

Phase 3 moves the agent transaction Overview and production buyer portal onto one presentation contract and one tracker renderer.

## Live path

- Staff screens consume `transactionRollup.transactionJourneySnapshot`.
- Buyer screens request the same canonical rollup through the client portal token, projected with the buyer audience role.
- Both are normalized by `buildTransactionJourneyPresentation`.
- Both render `TransactionJourneyTracker`, including the current workflow item and responsible team.

## Compatibility

The existing agent and buyer journey builders remain as fallbacks. If a legacy transaction, permission policy, or partial environment cannot return the canonical snapshot, the journey remains visible rather than failing the workspace.

The snapshot request runs alongside full portal hydration and does not delay the initial core portal response.

