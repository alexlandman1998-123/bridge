# Rentals staging recovery — Phase 7 SQL safety review

Phase 7 statically reviews the 16 unmanaged Rental foundation SQL sources before managed migration authoring. It requires a `begin; … commit;` boundary, rejects destructive table/schema/data operations, and flags every `SECURITY DEFINER` function for separate least-privilege review.

```sh
node scripts/rentals-staging-recovery-phase7-sql-safety-review.mjs
```

The current sources contain six `SECURITY DEFINER` functions, so the report deliberately blocks authoring until each is either replaced with a safe invoker design or is covered by a reviewed exception that limits callable roles and establishes an explicit authorisation check. This is in addition to the Phase 4 evidence and Phase 5 source-lock requirements.

The review never authorises a database apply, even when all static checks pass.
