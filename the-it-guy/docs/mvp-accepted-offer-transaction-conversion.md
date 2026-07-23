# Accepted-offer transaction conversion

The only successful accepted-offer conversion result is now a receipt with:

- a persisted transaction id;
- a ready or converted accepted-offer candidate; and
- either a verified atomic creation result or an explicitly persisted reused transaction.

If the receipt cannot be produced, the interface must not tell the agent that the transaction was created. Preserve the error and use the transaction health/audit check before attempting any recovery action.
