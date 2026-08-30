# Rentals Phase 51 — role and permission acceptance

Phase 51 locks the intended Rentals authority model to the platform permission registry and verifies its live database boundary.

| Role | Scope | Can manage | Cannot approve/activate/capture |
| --- | --- | --- | --- |
| Owner | All organisation branches | All Rentals operations | — |
| Manager | Assigned branch | Vacancy, application, tenancy, maintenance, inspections, collections | Tenancy activation and reports export |
| Admin staff | Assigned branch | Applications and inspections | Vacancy editing, tenancy changes, payment capture, approvals |
| Agent | Assigned records | Vacancy/application work, maintenance, inspections | Application approval, tenancy activation, collections |
| Viewer | Assigned records | Read-only Rentals visibility | All writes and collections |
| Suspended member | None | Nothing | Everything |

## Live database acceptance

The live access predicate is `rental_branch_access(organisation_id, branch_id)`. It permits an organisation administrator, an active member for unbranched data, or an active member of the record's branch. Every active Rentals RLS policy uses this predicate and no Rentals table or RPC is executable by `anon`.

## Release check

Run from `the-it-guy/`:

```bash
npm run test:rentals-phase51
```

Before rollout, use two real test accounts in distinct branches to confirm the UI and API both deny cross-branch reads/writes. Do not use a service key for this check: it bypasses RLS and cannot prove user access.
