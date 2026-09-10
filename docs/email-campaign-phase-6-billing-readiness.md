# Arch9 Email Campaigns — Phase 6: Billing readiness

Phase 6 introduces a no-charge billing boundary without connecting a wallet, payment provider or credit deduction.

## Included

- Per-organisation `email_billing_profiles` with a deliberately disabled `no_charge` adapter.
- Immutable-ish quote snapshots on `email_usage_records`: recipient count, adapter, currency, unit-price metadata, quote time and billing result.
- Quotes run after dispatch audience snapshotting, so the recorded volume matches the campaign’s immutable recipient set.
- Workspace usage panel makes the current adapter and R0 wallet charge explicit.
- A pure `noChargeEmailBillingAdapter` interface is ready for a future prepaid adapter to implement `quote` and `finalise` independently.

## Explicit non-goals

No wallet is read or mutated. No invoice, credit, payment provider, debit, balance gate or automatic charge exists in this phase. Even if a future prepaid profile row is present, the Phase 6 quote function writes `no_charge` and a zero wallet charge.
