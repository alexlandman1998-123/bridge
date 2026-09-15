# Supabase Phase 3 Staging Baseline Repair

Generated: 2026-09-14

## Scope

This phase repaired the minimum missing rental baseline in the configured non-production staging project `vaszuxjeoajeuhlcnzzf`. Production was not changed.

## Baseline Applied

| Version | Migration | Staging SQL | Staging ledger |
| --- | --- | --- | --- |
| `20260829210157` | `rental_application_tenancy_conversion` | Applied | Recorded applied |
| `20260830084850` | `rental_lease_versions` | Applied | Recorded applied |

Both versions were already recorded in production. They were absent from staging, which prevented the next pending rental migration from finding `rental_leases` and `rental_lease_versions`.

## Validation Evidence

- All 17 required pre-existing rental columns were present before application.
- Both migrations passed a cumulative rollback-only execution against staging before their real application.
- Before application, the three baseline tables were absent after rollback, proving the dry run left no residue.
- After application, `rental_tenancies`, `rental_leases`, and `rental_lease_versions` exist.
- `rental_convert_application_to_tenancy(uuid, integer)` and `rental_save_lease_draft(uuid, integer, jsonb)` exist.
- Both functions grant execution to `authenticated`, not `anon`.
- In an unauthenticated staging session, both functions rejected requests with `Authentication is required` before any application write.
- The two staging ledger records were queried and verified immediately after recording.

## Result

The staging baseline now supports the next pending migration, `20260913123000_rental_lease_version_seed_for_conversions.sql`, which previously failed safely because its prerequisite tables were missing.

## Boundary

This phase does not apply `20260913123000` or any later pending migration. Continue with the next approved phase using one migration at a time, with preflight, post-apply catalog/behavior checks, evidence capture, and ledger recording.
