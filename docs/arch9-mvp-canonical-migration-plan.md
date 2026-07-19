# Arch9 MVP canonical migration plan

After 1B captures the staging ledger and 1C classifies it, produce an auditable reconciliation plan. This is not a migration repair command.

Create a decisions file containing one approved forward-only decision for every collision:

```json
{
  "approvedBy": "release.owner@arch9.example",
  "approvedAt": "2026-07-19T00:00:00.000Z",
  "collisions": [
    {
      "version": "202607180025",
      "disposition": "forward_only_reconciliation",
      "owner": "database.owner@arch9.example",
      "rationale": "The remote timestamp is immutable; reconciliation must use a new migration version."
    }
  ]
}
```

Generate the plan:

```bash
npm run mvp:migrations:plan -- \
  --ledger=docs/staging-migration-ledger.json \
  --decisions=docs/staging-migration-decisions.json \
  --output=docs/staging-canonical-migration-plan.json
```

The plan preserves applied remote versions, highlights remote-only and local-only history, and requires one separate reviewed forward-only migration per reconciliation action. It must be approved before 1E or any staging deployment activity.
