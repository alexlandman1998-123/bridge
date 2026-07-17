# Outstanding migrations — Phase 3 ledger repair

Generated: 2026-07-17

## Scope

Phase 3 recorded the 17 Phase 2 `EXACTLY_LIVE` migrations as applied in the remote migration ledger. It did not execute any migration SQL or change application schema/data. The two `PARTIALLY_LIVE` migrations were excluded.

## Repair batches

| Batch | Versions | Result | Contract verification |
| --- | --- | --- | --- |
| Transaction network | `202606010001` | Applied in ledger | Partner business-distribution tests passed |
| Lead and communication | `202606030007`–`202606030011` | Applied in ledger | Communication, suggestions, and recommendations tests passed |
| Workspace platform | `202606040001`, `002`, `004`, `005` | Applied in ledger | Entitlement Phases 4–5 and billing Phases 6–7 passed |
| Commercial | `202606080002`, `202606110004`–`007` | Applied in ledger | Commercial MVP tests passed |
| Bond | `202606050001`, `202607050001` | Applied in ledger | Bond bank relationship tests passed |

Raw `supabase_migrations.schema_migrations` verification confirmed all 17 exact version/name pairs are present remotely.

## Schema immutability evidence

The public-schema fingerprints were identical before and after every ledger batch:

| Catalogue area | Before | After |
| --- | --- | --- |
| Columns | `73052c826fabc9222d23fc1bf74d54ad` | `73052c826fabc9222d23fc1bf74d54ad` |
| Constraints | `9628ebcc5e5aa5fcf707df5f0dbf6133` | `9628ebcc5e5aa5fcf707df5f0dbf6133` |
| Functions | `1d6d2ccad42c3f892735867ce6964550` | `1d6d2ccad42c3f892735867ce6964550` |
| Indexes | `71fa6fddfaac1d28e1ada0354d56bc2c` | `71fa6fddfaac1d28e1ada0354d56bc2c` |
| Policies | `c0e3c898dcfb4216d06684b2a050decd` | `c0e3c898dcfb4216d06684b2a050decd` |

The fingerprint query is stored at `sql/outstanding-migrations-phase3-schema-fingerprint.sql`.

## Supabase CLI timestamp-collision limitation

`202607050001` now appears as a normal matched row. Sixteen repaired 12-digit versions share prefixes with unrelated 14-digit migration versions. The Supabase CLI consequently renders each repaired version as a local-only/remote-only split pair even though the raw remote ledger contains the correct 12-digit version and migration name.

This is a tooling/alignment limitation, not a missing migration. Do not execute these migrations again and do not remove their verified remote ledger rows. Resolving the CLI display would require a separate timestamp-canonicalisation project spanning the colliding 14-digit migrations.

Post-repair audit state:

- Matched CLI rows: 401.
- Verified timestamp-collision rows: 16.
- Genuine local-only partial migrations: 2.
- Genuine remote-only migrations: 0.

## Excluded migrations

- `202606090010_created_by_access_remediation.sql`
  - Three `private_listings` policies remain missing.
- `202607070001_drop_demo_all_rls_grants.sql`
  - 506 legacy grant findings remain across 46 tables.

These remain Phase 4/7 reconciliation work and must not be ledger-repaired yet.

## Current gate

**Status: PHASE_3_COMPLETE_WITH_TIMESTAMP_COLLISION_EVIDENCE**

All authorised ledger-only repairs are recorded and the public schema is unchanged. Broad `supabase db push --include-all` remains prohibited because the CLI still presents collision rows and the two partial migrations are unresolved.
