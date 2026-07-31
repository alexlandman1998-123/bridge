# Phase 0/5 migration-ledger reconciliation

Reviewed: 2026-07-31  
Production project: `isdowlnollckzvltkasn`

## Read-only comparison

The comparison used the `origin/main` migration tree and a read-only linked production migration-list query:

```text
npx supabase@2.109.1 migration list --linked --output-format json
```

| Measure | Result |
| --- | ---: |
| Local migration files on `main` | 614 |
| Production ledger rows | 613 |
| Matched versions | 613 |
| Pure local-only versions | 1 |
| Pure remote-only versions | 0 |
| Unreviewed split versions | 0 |

The single apparent local-only version is `202607270012`.

## Resolution

`202607270012_canonical_matter_lifecycle_stages.sql` is a historical partial-live migration. Its reviewed clearance packet marks it `corrective_migration_required` and binds it to:

```text
202607290005_corrective_canonical_matter_lifecycle_stages.sql
```

The corrective migration has complete staging evidence and complete production evidence, including target-state, catalog, behavior, and rollback/no-residue checks. The original migration must remain non-runnable and must not be recorded with `migration repair`; doing so would misrepresent the historical partial application.

The 17 split rows are already covered by the reviewed Phase 6 baseline. They are treated as confirmed live, manually verified, or intentionally superseded according to the Phase 6 report.

## Decision

Ledger drift is resolved under the repository’s closeout semantics:

- no production SQL was executed during this reconciliation;
- no historical migration file was renamed or rewritten;
- no `migration repair` was run for `202607270012`;
- the corrective promotion is the authoritative target-state resolution;
- the Phase 0 broad-push guard remains active until its separate reviewed retirement change.

