# Transaction Journey Alignment: Phase 6

Phase 6 aligns Arch9's token-accessible external transaction workspace and public status-share route with the canonical six-milestone transaction journey.

## Token boundary

Both routes continue to resolve their existing access token before querying transaction data. The journey rollup uses that same scoped Supabase client and returns only `transactionJourneySnapshot`; it does not expose the full workflow rollup, blockers, available actions, evidence, or internal audit fields.

Every token projection uses the `external_share` audience, even when the access-link role represents a professional. This guarantees external-safe workflow summaries and generic owner labels such as Finance Team or Legal Team.

## Surfaces

- External Transaction Portal: the global Master Transaction Progress section now renders `TransactionJourneyTracker`.
- Transaction Status Share: the public timeline now renders the same tracker and current workflow item.

Existing detailed workflow groups and client-visible updates remain available below the shared macro journey. They do not redefine its milestone.

## Compatibility

If a token-scoped environment cannot resolve the canonical rollup, the API returns a null snapshot and the existing lifecycle renderer remains available. No public route fails merely because an older deployment lacks canonical workflow access.
