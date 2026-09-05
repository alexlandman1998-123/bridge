# Rentals staging recovery — Phase 1 freeze record

**Recorded:** 2026-09-05  
**Staging project:** `vaszuxjeoajeuhlcnzzf`  
**Scope:** rentals CRM release recovery only

## Purpose

This record freezes the observed staging state before any recovery, migration-ledger repair, schema change, reset, or rebuild action is considered. No mutating database or deployment command was run while creating it.

## Observed readiness state

The rentals staging-foundation readiness report returned `ready: false`.

- The migration ledger is **not reconciled**: the remote ledger contains migration identifiers not present locally, while the repository contains local migration files absent from the remote ledger.
- The current staging database does not expose the core canonical rentals objects required by the release:
  - `rental_properties`
  - `rental_units`
  - `rental_vacancies`
  - `rental_property_mandates`
  - `rental_applications`
  - `rental_tenancies`
  - `rental_set_updated_at`
- The readiness gate correctly stops release migration work with: “Reconcile the staging migration ledger before applying rental schema changes.”

This means staging is not a safe target for `db push`, migration repair, or incremental rental release work.

## Configuration inventory

The local staging configuration has values configured for the following names. Values and credentials were intentionally neither recorded nor copied into this document.

- `SUPABASE_URL`
- `VITE_SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STAGING_PROJECT_REF`
- `SUPABASE_STAGING_DB_URL`
- `SUPABASE_STAGING_RECOVERY_CONFIRMED`

## Backup and recovery position

The installed Supabase CLI can inspect and manage project/database connections, but it does not provide an operation to create or inspect hosted-platform backups. Therefore **no platform snapshot or backup has been verified by this phase**.

Before a rebuild is authorised, the platform owner must confirm in the Supabase dashboard (or an approved operations system):

1. the timestamp and identifier of a restorable staging backup/snapshot, or that staging is explicitly disposable;
2. the production baseline and migration history that will be used as the authoritative source;
3. that recovery will use sanitized data only — never production credentials or production data copied without approval;
4. that outbound integrations (email, webhooks, payment providers and other side effects) are disabled or redirected in the recovered staging environment.

## Exit criteria for Phase 1

- [x] Capture the staging project reference and readiness evidence.
- [x] Capture configuration *names* without exposing values.
- [x] Confirm that no schema, ledger, deployment, or reset operation was performed.
- [ ] Obtain a platform backup/snapshot reference, or written confirmation that this staging project may be discarded.
- [ ] Freeze staging deployments for the recovery window.

## Next phase boundary

Only after the two remaining exit criteria are satisfied may Phase 2 inspect production’s authoritative migration baseline and prepare a reversible staging rebuild runbook. It must not execute the rebuild yet.
