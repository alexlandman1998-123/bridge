# Supabase Phase 4 — Seller and Client Portals

Applied: 2026-07-14
Linked project: `isdowlnollckzvltkasn`
Branch: `codex/db-phase0-reconciliation`

## Outcome

Phase 4 deployed the five seller/client portal migrations in dependency order and added a forward RPC permission-hardening migration. The exact five-file bundle was first executed against production inside a transaction ending in `ROLLBACK`. All five deployment transactions and the permission delta then completed successfully.

| Metric | Before | After |
| --- | ---: | ---: |
| Local migration files | 358 | 359 |
| Matched versions | 315 | 321 |
| Pure local-only versions | 43 | 38 |
| Pure remote-only versions | 0 | 0 |
| Split versions | 0 | 0 |

## Applied migrations

- `202607140004` — portal lifecycle controls, privacy-safe access events and stable access RPCs.
- `202607140005` — stable seller portal identifiers and hashed one-time invitations.
- `202607140006` — failed-login counters, temporary lockout and authenticated portal management.
- `202607140007` — security alerts, diagnostics and retention controls.
- `202607140008` — hashed, expiring, single-use password recovery.
- `202607140020` — explicit execute permissions for anonymous, authenticated and service-only RPC boundaries.

The live preflight found that production had only the five older seller password/session columns and legacy RPC names. None of the Phase 4 tables, stable-link fields, monitoring objects or recovery objects existed. Because the complete historical sequence passed as one rollback-only bundle across all 28 existing onboarding rows, the exact originals were safer than creating a duplicate consolidated migration.

## Live verification

| Check | Result |
| --- | ---: |
| Seller portal columns | 26 |
| Existing onboarding rows with missing stable token | 0/28 |
| Duplicate stable-token groups | 0 |
| Portal tables with RLS | 2/2 |
| Expected portal indexes | 7/7 |
| Final portal RPCs | 13/13 |
| Anonymous portal management | denied |
| Authenticated portal management | allowed |
| Anonymous recovery issuance | denied |
| Authenticated recovery issuance | denied |
| Service-role recovery issuance | allowed |
| Anonymous recovery completion | allowed |

## Verification gates

Passed:

- Full five-migration live rollback execution with no residue
- Phase 1 access-stability contract
- Phase 2 stable-link and invitation contract
- Phase 3 security-control contract
- Phase 4 operational-monitoring contract
- Phase 5 password-recovery contract
- Seller portal UI regression suite
- Recovery behavior rollback assertions: hashed token, cooldown, completion, single use, stable-link preservation and diagnostics
- Supabase migration safety check

The older `seller-portal-alignment` suite still expects the removed `SellerPropertyPerformance` component name. Its five database-specific successor suites pass; the failure is unrelated to the deployed SQL.

## Evidence

- Permission delta: `supabase/migrations/202607140020_seller_portal_rpc_execute_hardening.sql`
- Verification query: `sql/supabase-phase4-portal-verification.sql`
- Current baseline: `docs/supabase-migration-phase-0-evidence.md`
- Remaining backlog: `docs/supabase-migration-phase-5-module-drift-report.md`
