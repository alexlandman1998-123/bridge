# Rentals Phase 2 — Lead, application and tenancy linkage

## Canonical relationship

`public.rental_applications.lead_id` links a canonical rental application to
the shared CRM lead that originated it. The column is nullable for imported or
historical applications, allowing one lead to own multiple applications without
creating a second contact or rental-lead table.

```text
shared CRM lead 1 ──< rental applications >── 1 vacancy
                              │
                              └── 0..1 tenancy
```

## Conversion behaviour

The managed conversion function now records the tenant lead as `Converted to
tenancy` after it creates (or re-finds idempotently) the tenancy and lease. It
also records the canonical application and tenancy IDs in the rental lead's
relationship metadata. The update is constrained to the application
organisation.

## Delivery state

The forward migration is
`supabase/migrations/20260905125639_rental_application_lead_linkage.sql`.
It has not been applied to staging or production: the Phase 1 staging-foundation
gate remains blocked and must pass before this migration is promoted.
