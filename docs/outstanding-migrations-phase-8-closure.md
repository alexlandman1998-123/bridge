# Outstanding migrations Phase 8: closure and prevention

Date: 2026-07-17

## Outcome

The historical migration reconciliation is closed. There are no genuine local-only or remote-only migrations remaining, and all 19 migrations reviewed through Phases 2–7 have exact version/name rows in the raw linked ledger.

| Final gate | Result |
| --- | --- |
| Pure local-only rows | 0 |
| Pure remote-only rows | 0 |
| Exact reconciled raw-ledger rows | 19/19 |
| Missing reconciled rows | 0 |
| Unrestricted legacy policies | 0 |
| Scoped security successor | Present |
| Schema drift from Phase 7 repair | None |
| Verified CLI split-display collisions | 17 |

## Collision interpretation

The remaining 17 split rows are caused by 12-digit migration versions sharing prefixes with unrelated 14-digit versions. Each 12-digit migration has already been verified against the raw `supabase_migrations.schema_migrations` ledger and, where applicable, against live catalog objects and workflow tests.

They are display/tooling collisions, not pending migrations. Do not replay, delete, rename, or ledger-repair these rows as ordinary pending work.

## Permanent deployment guard

The repository guard now reports the Phase 8 baseline and continues to block:

- broad `db push`;
- database reset;
- unreviewed migration repair.

This remains necessary because the Supabase CLI comparison can still present verified history as split local/remote rows. New migrations should be applied individually with a reviewed dry run and post-application raw-ledger verification until the timestamp-prefix history is canonicalised in a separate project.

Run the guard with:

```sh
npm run supabase:guard
```

The reusable final database gate is `sql/outstanding-migrations-phase8-closure-gate.sql`.

## Release procedure for future migrations

1. Confirm the new migration has a unique timestamp that is not a prefix collision.
2. Run the Phase 5 and Phase 6 read-only audits.
3. Review the exact migration SQL and rollback path.
4. Apply only the approved migration, without `--include-all`.
5. Verify its exact raw-ledger version/name row and live schema contract.
6. Refresh the audit reports and rerun the Phase 8 closure gate.

## Decision

`PHASE_8_MIGRATION_RECONCILIATION_CLOSED`

No outstanding migration SQL should be executed from the reconciled historical set.
