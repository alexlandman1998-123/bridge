# Accepted-offer transaction conversion

The only successful accepted-offer conversion result is now a receipt with:

- a persisted transaction id;
- a ready or converted accepted-offer candidate; and
- either a verified atomic creation result or an explicitly persisted reused transaction.

If the receipt cannot be produced, the interface must not tell the agent that the transaction was created. Preserve the error and use the transaction health/audit check before attempting any recovery action.

Before a new transaction is created, the accepted-offer conversion candidate is re-checked as the final gate against the exact creation payload. A stale candidate, mismatched listing, missing buyer lead, mismatched organisation, or missing offer amount must block transaction creation rather than relying on the transaction command to fail later.
