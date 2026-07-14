# Supabase Security Phase 1 — Legacy Demo RLS Replacement

Applied: 2026-07-14
Linked project: `isdowlnollckzvltkasn`
Branch: `codex/db-phase0-reconciliation`
Migration: `202607140018_legacy_demo_rls_scoped_replacement.sql`

## Outcome

Phase 1 replaced legacy demo-wide database access with scoped production policies. The migration was committed and pushed before it was applied. It was then recorded in `supabase_migrations.schema_migrations` as applied.

The unsafe, never-applied `202607070001_drop_demo_all_rls_grants.sql` draft was removed after deployment. Its blanket grant revocation was intentionally superseded by the scoped `202607140018` migration, preventing the obsolete draft from appearing as a future deployable migration.

| Check | Before | After |
| --- | ---: | ---: |
| `*_demo_all` policies | 41 | 0 |
| Equivalent `Allow all read/write` policies on buyers, documents, notes and units | 8 | 0 |
| Tables with RLS disabled in the seven-table replacement set | 0 | 0 |
| Replacement policies across the seven previously unprotected tables | 0 | 28 |
| Normalized matched migration versions | 273 | 274 |
| Pure local-only migrations | 85 | 84 |
| Pure remote-only migrations | 0 | 0 |
| Split versions | 0 | 0 |

The migration deliberately did not revoke table grants. Supabase API requests require both grants and RLS, so the correction removes permissive policies while retaining base privileges for legitimate scoped access.

## Replacement scopes

- `document_groups` and `document_templates`: enabled/client-visible reads for anonymous portals; authenticated users may see enabled internal taxonomy; platform-admin writes only.
- `document_requirements`: global or development-scoped reads; development-organisation/platform-admin writes.
- `document_request_groups`: transaction/token-scoped reads; internal transaction-member writes.
- `firm_memberships`: self or same-firm reads; firm-admin/platform-admin writes through a recursion-safe security-definer helper.
- `firms`: authenticated directory reads; platform-admin creation and firm-admin/platform-admin updates or deletion.
- `transaction_issue_overrides`: transaction-scoped reads; internal transaction-member writes.
- `buyers`, `documents`, `notes`, and `units`: retained their existing scoped production policies after the unrestricted baseline policies were removed.

## Verification

- Static migration safety contract: passed.
- Migration safety check: 359 unique timestamps, no duplicates.
- Exact migration executed inside a rollback transaction: passed with no residue.
- Post-apply catalog verification: passed.
- Anonymous no-token smoke:
  - 5 enabled client-visible document groups visible.
  - 0 hidden/disabled document groups or inactive templates visible.
  - 0 buyers, documents, notes, units, firms, memberships, request groups or issue overrides visible.
- Nonexistent authenticated identity smoke:
  - 0 memberships, document request groups, documents, notes or issue overrides visible.
- Post-apply ledger audit: 274 matched, 85 pure local-only, 0 pure remote-only, 0 split.

## Evidence

- Migration: `supabase/migrations/202607140018_legacy_demo_rls_scoped_replacement.sql`
- Verification SQL: `sql/supabase-phase1-security-verification.sql`
- Updated catalog/ledger baseline: `docs/supabase-migration-phase-0-evidence.md`
- Updated backlog: `docs/supabase-migration-phase-5-module-drift-report.md`

No application table data was modified by this release.
