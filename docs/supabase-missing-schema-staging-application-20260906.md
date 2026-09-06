# Supabase Missing-Schema Staging Application

Generated: 6 September 2026

## Outcome

The 30 production-manifest rows classified as
`apply_original_after_dependency_check` were re-audited against staging and
processed through the guarded single-file runner.

| Result | Count |
| --- | ---: |
| Manifest candidates | 30 |
| Already recorded on staging | 4 |
| SQL applied, catalog verified, and ledger recorded in this pass | 12 |
| Blocked by unmet or corrective predecessors | 13 |
| Blocked because staging is partial | 1 |

No production database was targeted.

## Applied in this pass

### Bond finance

- `20260828203724`
- `20260905100612`
- `20260905100908`
- `20260905101301`

### Lead, compliance, and transaction runtime

- `202608290001`
- `202608290002`
- `20260829111644`
- `20260831190341`

### Canonical document trust

- `20260905091122`
- `20260905095152`

### Agent and attorney access

- `20260906065759`
- `20260906070515`

Each row has complete staging evidence with `sqlApplied=true`, passing catalog
and behavior checks, and a verified staging ledger receipt.

## Blocked remainder

- Bond finance: `20260905102430`, `20260905102813`, `20260905102934`
- Other/manual predecessor: `20260820160621`, `20260831150740`
- Transaction network: `20260829112135` is partial (1/4); `20260829112530`
  depends on it
- Developer/referral: `20260901170254`, `20260901170909`, `20260901174924`,
  `20260903130012`
- Other: `20260905141008`, `20260905141011`
- Attorney: `20260906071644`

The attempted `20260901170254` execution failed inside its explicit
transaction because `bridge_can_view_development_record(uuid)` is absent.
Post-failure catalog verification remained 0/14, confirming rollback with no
partial residue. It and its successors remain blocked rather than being
ledger-recorded.

## Tooling note

The guarded staging runner requires the pinned `pg` package to execute
multi-statement migration files in one connection. `pg@8.16.3` is now pinned
as a root development dependency; the lockfile is committed with it.
