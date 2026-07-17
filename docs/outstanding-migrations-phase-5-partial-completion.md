# Outstanding migrations — Phase 5 partial-migration completion

Generated: 2026-07-17

## Outcome

Phase 5 found no remaining non-security partially-live migration to patch. The apparent access-remediation gap was resolved in Phase 4 as intentional policy supersession, and all 18 resolved historical migrations are present in the raw remote ledger with exact version/name pairs.

No migration SQL or ledger repair was performed in Phase 5.

## Completion gate

| Check | Result |
| --- | --- |
| Expected resolved history rows | 18 |
| Exact raw-ledger rows present | 18 |
| Missing resolved rows | 0 |
| Non-security partial migrations | 0 |
| Genuine unresolved migrations | 1 |
| Unresolved migration | `202607070001_drop_demo_all_rls_grants.sql` |
| Legacy `*_demo_all` policies | 0 |

The reusable read-only gate is stored at `sql/outstanding-migrations-phase5-completion-gate.sql`.

## Timestamp-collision interpretation

The refreshed Supabase audit reports:

- 401 normally matched CLI rows.
- 17 split-display rows caused by 12-digit/14-digit timestamp-prefix collisions.
- 1 pure local-only migration.
- 0 pure remote-only migrations.

The 17 split-display rows are already present in the raw ledger and were schema-fingerprint verified in Phases 3–4. They are not pending SQL and must not be executed again.

## Security isolation

`202607070001_drop_demo_all_rls_grants.sql` remains deliberately unapplied and unrecorded. Its broad grant cleanup is outside Phase 5 because it affects anonymous/authenticated privileges across 46 legacy tables and requires a dedicated rollback and access-test plan.

## Current gate

**Status: PHASE_5_COMPLETE_NO_NON_SECURITY_PARTIALS**

Phase 6 bond work is already contract-complete from the earlier bond repair batch. The next state-changing work should be the dedicated security phase; do not use `supabase db push --include-all` to reach it.
