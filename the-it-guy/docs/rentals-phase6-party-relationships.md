# Rentals Phase 6 — Canonical Party Relationships

Phase 6 makes Rentals a consumer of the canonical CRM party identity. It does not create a Rentals contact table, change a Sales contact, or merge a person's Sales and Rentals workflow data.

## Typed relationship layer

`rental_party_relationships` is the planned rental-owned link table. It records an organisation/branch-scoped relationship between a canonical party and a rental entity:

- landlord → rental property
- applicant → rental application
- tenant → rental tenancy
- contractor → maintenance request or inspection

The exact active tuple `(organisation, party, role, entity type, entity)` is unique. A party can legitimately be a seller in Sales, a landlord of one property and a tenant in a different tenancy because those are independent typed relationships.

## Immutable workflow snapshots

Submission and signing flows call `createRentalPartyWorkflowSnapshot`. The snapshot is a detached, immutable capture of the canonical party at the relevant workflow moment. Later CRM edits do not rewrite an application, tenancy or lease record.

## UI boundary

`RentalPartySelector` is presentation-only. Its parent supplies canonical CRM search and create actions; it never writes directly to `contacts` or a Rentals copy of contacts.

## Database/RLS handoff

No migration is applied in this phase because the repository has no configured local Supabase migration project or connected database authority. Phase 7 introduces the tables in an expand-first migration, enabling RLS and testing it in the same change:

1. Revoke default grants and grant only required authenticated operations.
2. Scope reads/writes by organisation, branch and assignment—not by `party_id` alone.
3. Keep workflow snapshots insert-only from a server command boundary.
4. Use `USING` and `WITH CHECK` for relationship updates.
5. Add SQL allow/deny tests, including cross-organisation and cross-branch attempts.

`private_listings` and Sales CRM policies remain excluded.

## Verification

`npm run test:rentals-phase6` verifies role coexistence, duplicate prevention, immutable snapshots, organisation mismatch rejection and the RLS handoff. 
