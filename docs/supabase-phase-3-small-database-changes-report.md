# Supabase Phase 3 — Small Database Changes

Applied: 2026-07-14
Linked project: `isdowlnollckzvltkasn`
Branch: `codex/db-phase0-reconciliation`

## Outcome

Phase 3 deployed six small existing migrations and one forward bond-workflow reconciliation. Every migration was tested as a combined rollback transaction before deployment, verified in the live catalog after deployment, and then recorded individually in the Supabase migration ledger.

| Metric | Before | After |
| --- | ---: | ---: |
| Matched versions | 308 | 315 |
| Pure local-only versions | 50 | 43 |
| Pure remote-only versions | 0 | 0 |
| Split versions | 0 | 0 |
| Duplicate local timestamps | 0 | 0 |

## Applied migrations

- `202606290014` — added `development_profiles.seller_details`.
- `202606300005` — added two pending client-invite lookup indexes.
- `202607010001` — replaced mandate `agency_name` placeholders with `organisation_name`.
- `202607080007` — added profile biography, department, office, language and theme columns.
- `202607080008` — added four authenticated attorney-branding storage policies.
- `202607140003` — added seller/spouse/agent/contractor/witness signer-role constraints.
- `202607140019` — reconciled the bond grant workflow with columns, indexes and expanded stage/event constraints.

The unsafe partially represented `202607050001_bond_grant_workflow_milestones.sql` file was removed after `202607140019` was deployed. It was never falsely marked as applied.

## Live verification

| Check | Result |
| --- | ---: |
| Profile settings columns | 5/5 |
| Development seller-details column | present |
| Attorney-branding policies | 4/4 |
| Mandate `agency_name` placeholders remaining | 0 |
| Client-invite indexes | 2/2 |
| Signer-role constraints | 2/2 |
| Bond grant columns | 11/11 |
| Bond grant indexes | 2/2 |
| Finance constraints containing grant stages | 4/4 |

Exactly nine mandate template rows required placeholder conversion. Existing signer rows had no invalid roles before the constraints were installed.

## Verification gates

Passed:

- Combined live rollback execution with no residue
- Supabase migration safety check
- Attorney onboarding RLS classification
- Unified invite architecture
- Mandate scenario profile
- Document request scenario matrix
- Bond dashboard safety

Two broader application suites have unrelated existing failures:

- Profile settings premium refactor: stale settings-navigation assertion for `Lead Capture`.
- Buyer onboarding scenarios: extensionless `crossModuleDocumentKeyMapService` import cannot resolve in direct Node execution.

Neither failure is in a file changed by Phase 3 or in the database operations verified above.

## Evidence

- Forward bond migration: `supabase/migrations/202607140019_bond_grant_workflow_milestones_reconciliation.sql`
- Verification query: `sql/supabase-phase3-small-changes-verification.sql`
- Current baseline: `docs/supabase-migration-phase-0-evidence.md`
- Remaining backlog: `docs/supabase-migration-phase-5-module-drift-report.md`
