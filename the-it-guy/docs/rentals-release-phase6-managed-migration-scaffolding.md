# Rentals release readiness — Phase 6 managed migration scaffolding

Phase 6 can create the 16 empty managed-migration files only after the Phase 5 source-baseline lock passes. Its default command is read-only and reports the exact creation plan:

```sh
node scripts/rentals-release-phase6-scaffold-managed-migrations.mjs
```

When the report is ready and a reviewer has explicitly approved creation, run:

```sh
node scripts/rentals-release-phase6-scaffold-managed-migrations.mjs \
  --create --confirm=CREATE_MANAGED_RENTAL_MIGRATION_SCAFFOLDS
```

The runner invokes `supabase migration new` for each file; it never invents migration timestamps. It does not copy source SQL, connect to a database, repair a ledger, or apply a migration. Source content is copied only after the empty scaffolds are reviewed in the following implementation step.
