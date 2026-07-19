# Arch9 MVP — Phase 6 production decision

Phase 6 produces one of two outcomes: `no_go` or `ready_for_controlled_production_pilot`. It does not authorise a broad launch.

The production gate requires:

1. Phase 1 and Phase 2 local contracts passing.
2. A reconciled staging migration-plan result.
3. Four passing staging UI journeys.
4. A passing operations/data review with no unresolved high-severity finding.
5. A decision-evidence JSON file with named release, pilot, support, and rollback owners; reviewed rollback procedure; and accepted MVP limitations.

Example decision evidence:

```json
{
  "releaseOwner": "release.owner@arch9.example",
  "pilotOwner": "operations.owner@arch9.example",
  "supportOwner": "support.owner@arch9.example",
  "rollbackOwner": "engineering.owner@arch9.example",
  "rollbackProcedureReviewed": true,
  "knownMvpLimitationsAccepted": true
}
```

Run the check:

```bash
npm run mvp:phase6:readiness -- \
  --staging-ledger=docs/staging-migration-ledger.json \
  --journey-evidence=docs/staging-mvp-journeys.json \
  --review-evidence=docs/staging-mvp-review.json \
  --decision-evidence=docs/production-pilot-decision.json
```

Only `ready_for_controlled_production_pilot` permits Phase 7. The first production batch remains limited to ten transactions.
