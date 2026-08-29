# Rentals Phase 1 — Domain Contract

This phase introduces a versioned, executable vocabulary for Residential Long-Term Rentals. It changes no database table, policy, route or runtime workflow.

## Canonical ownership

```text
Platform CRM owns Party.
Rentals owns Portfolio, Property, Unit, Vacancy, Application, Screening, Lease, Tenancy,
Charges, Payments, Maintenance Requests, Inspections, Renewals and Notices.
Shared Listings owns Listing as the marketing projection of a Vacancy.
```

## Non-negotiable boundaries

- A Property and Unit are inventory; a Listing is marketing.
- A Vacancy is availability; a Tenancy is occupation.
- A Lease is the agreement; a Tenancy is the operational relationship.
- An applicant/tenant/landlord is a role held by a canonical Party, not a second contact record.
- Screening informs a person’s decision; it never approves a tenant automatically.
- A Unit has at most one open Vacancy and one active Tenancy.
- Sales state and default query behavior remain independent.
- Short-term bookings/stays will be separate future workflows.

## Transition rules locked now

```text
Vacancy: Draft → Marketing → Enquiries/Applications → Tenant Selected → Lease Pending → Filled
Application: Started/Incomplete → Submitted → Screening → Ready for Review → Approved or Declined
Lease: Draft → Awaiting Tenant/Landlord → Signed → Active
Tenancy: Draft → Move-In Pending → Active → Notice/Move-Out Pending → Closed
```

The executable contract is in `src/services/rentals/rentalDomainContract.js`.

## Phase 2 handoff

Phase 2 creates the `src/modules/rentals` boundary and moves new work behind its public interfaces. It must use this contract rather than introducing new status names or ownership rules.
