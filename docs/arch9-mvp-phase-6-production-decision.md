# Arch9 MVP — Phase 6 production decision

Phase 6 produces one of two outcomes: `no_go` or `ready_for_controlled_production_pilot`. It does not authorise a broad launch.

The production gate requires:

1. Phase 1 and Phase 2 local contracts passing.
2. A reconciled staging migration-plan result.
3. Phase 3D deployment evidence for the same staging project and four passing UI journeys.
4. A passing operations/data review with no unresolved high-severity finding.
5. A time-stamped decision-evidence JSON file approving only a controlled production pilot, with named release, pilot, support, and rollback owners; reviewed rollback procedure; accepted MVP limitations; the Phase 5 staging-acceptance decision; and an initial batch fixed at ten.

Example decision evidence:

```json
{
  "decision": "approved_for_controlled_production_pilot",
  "approvedBy": "release.owner@arch9.example",
  "approvedAt": "2026-07-19T00:00:00.000Z",
  "approvedByRole": "release",
  "releaseOwner": "release.owner@arch9.example",
  "pilotOwner": "operations.owner@arch9.example",
  "supportOwner": "support.owner@arch9.example",
  "rollbackOwner": "engineering.owner@arch9.example",
  "initialBatchSize": 10,
  "pilotScope": "controlled_production_pilot",
  "stagingProjectRef": "staging-project-ref",
  "stagingAcceptanceDecision": "accepted_for_pilot_consideration",
  "rollbackProcedureReviewed": true,
  "knownMvpLimitationsAccepted": true,
  "productionCredentialsUsed": false
}
```

Run the check:

```bash
npm run mvp:phase6:readiness -- \
  --staging-ledger=docs/staging-migration-ledger.json \
  --deployment-evidence=/secure-local-path/staging-deployment-evidence.json \
  --journey-evidence=docs/staging-mvp-journeys.json \
  --review-evidence=docs/staging-mvp-review.json \
  --decision-evidence=docs/production-pilot-decision.json
```

Only `ready_for_controlled_production_pilot` permits Phase 7. The first production batch remains limited to ten transactions.
