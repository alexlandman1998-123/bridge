# Rentals release readiness — Phase 7 local migration verification

Phase 7 first verifies that every managed Rental migration exists and has content identical to its locked source. The default report is read-only:

```sh
node scripts/rentals-release-phase7-local-verification.mjs
```

Only after the Phase 5 baseline is locked and all 16 migration files match exactly may an operator explicitly run the local verification:

```sh
node scripts/rentals-release-phase7-local-verification.mjs \
  --verify --confirm=VERIFY_LOCAL_RENTAL_MIGRATIONS
```

Verification resets the **local** Supabase database without seeds, applies local migrations, lists the local ledger, and runs the local security advisor with warnings treated as failures. It never targets staging or production.
