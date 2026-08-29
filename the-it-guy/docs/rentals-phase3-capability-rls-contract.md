# Rentals Phase 3 — Capability and RLS Contract

Phase 3 introduces the authorization contract without changing existing Sales permissions or shared-table RLS.

## Capability model

Rental actions are named independently of Sales permissions, for example:

```text
rentals.portfolio.manage
rentals.vacancy.publish
rentals.application.approve
rentals.tenancy.activate
rentals.collections.reverse_payment
rentals.maintenance.manage
```

The current platform permission engine remains the enforcement base until rental-owned tables and routes are introduced. Sensitive rental decisions are additionally limited to rental authority roles. In particular, an agent can manage a lead but cannot approve an applicant, activate a tenancy, or reverse a payment.

## RLS handoff

No rental tables exist yet, so no new public table or RLS policy is created in this phase. When each rental table is introduced:

1. Enable RLS in the same migration.
2. Revoke default grants from `anon` and `authenticated`.
3. Grant only the needed operations to `authenticated`.
4. Add `TO authenticated` policies with organisation, branch and assigned-user predicates.
5. Include `USING` and `WITH CHECK` for updates.
6. Add allow and deny SQL tests for every operation.

The contract deliberately excludes `private_listings`: Rentals may project to it, but its shared-table policies are not altered by the rental module.
