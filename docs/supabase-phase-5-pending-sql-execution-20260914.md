# Supabase Phase 5 Pending SQL Execution

Generated: 2026-09-14

## Scope

Phase 5 applies genuine missing SQL to the configured staging project one version at a time. Production was not changed.

## Completed

| Version | Migration | Staging SQL | Staging ledger | Verification |
| --- | --- | --- | --- | --- |
| `20260913123000` | `rental_lease_version_seed_for_conversions` | Applied | Recorded applied | Seed function and trigger exist; zero leases are missing version 1. |

The staging evidence record is reviewed and approved by Alex.

## Blocked Next Version

| Version | Migration | Result | No-residue verification |
| --- | --- | --- | --- |
| `20260913130000` | `rental_notice_acknowledgement_transition` | SQL application stopped because `public.rental_notices` is absent from staging. | The notice-acknowledgement function is absent and the version is not recorded in staging's ledger. |

The original migration is transactional, so the failed application left no partial schema change.

## Dependency Decision

`rental_notices` is introduced by the historic rental notice-capture train, not by this migration. It must be restored through its verified prerequisite sequence in staging before `20260913130000` can be applied. Do not create the table ad hoc or record this migration as applied.

## Next Step

Build and validate the smallest complete rental notice-capture dependency train in staging, then retry `20260913130000` with the same preflight, application, verification, evidence, and ledger-recording process.
