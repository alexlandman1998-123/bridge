# Transaction journey alignment: Phase 2 canonical contract

## Outcome

Phase 2 adds a versioned `transactionJourneySnapshot` to every result produced by `resolveTransactionRollup()`. The snapshot is computed once at the server-owned workflow boundary and is ready for agent, buyer, seller, attorney, bond-originator, developer and external-share surfaces to consume in Phase 3.

No portal renderer is switched in this phase. Existing screens continue to behave as before while the canonical contract is verified alongside them.

## Contract

The snapshot contains:

```js
{
  schemaVersion: 1,
  version,
  transactionId,
  audience: { role, visibility },
  status,
  progressPercent,
  currentMilestoneKey,
  currentMilestone,
  currentWorkflowItem,
  milestones,
  derivedAt,
  source: { parentStage, workflowKey, stepKey }
}
```

The canonical milestones remain:

1. OTP Signed
2. Finance
3. Guarantees
4. Transfer
5. Lodgement
6. Registration

## Macro milestone versus current work

The milestone rail and the current-work box intentionally describe different levels:

- `currentMilestoneKey` is the monotonic, shared transaction position.
- `currentWorkflowItem` is the direct active workflow step and its operational owner.

Transfer preparation may run concurrently while guarantees are outstanding. In that situation the shared milestone remains `guarantees`, while the current workflow item can truthfully say `transfer_documents_prepared`. This prevents the macro journey from moving backwards when parallel professional work changes focus.

## Audience projection

Every audience receives the same:

- snapshot version;
- current milestone key;
- milestone states;
- progress percentage;
- workflow item key;
- workflow key;
- owner role; and
- derived timestamp.

Only presentation fields such as `ownerLabel` and `summary` vary. Buyer, seller and public projections use client-safe wording. Raw blockers, internal notes, bank values and private operational detail are not copied into the journey snapshot.

For example, the canonical workflow item `feedback_received` renders as:

- Internal: `The bond originator is waiting for bank feedback and quotes.`
- External: `The bond application is with the banks and the finance team is waiting for feedback and quotes.`

## Integration boundary

`transactionWorkflowRollup.js` remains the authority. It supplies the resolved parent stage, active workflow, active step, blockers, progress and derivation timestamp to the pure snapshot builder.

The existing top-level rollup fields remain intact for backwards compatibility. Phase 3 portal migrations should read `rollup.transactionJourneySnapshot` and must not reconstruct journey state from those legacy fields.

## Verification

```bash
npm run test:transaction-journey-phase1
npm run test:transaction-journey-phase2
npm run test:transaction-workflow-rollup
npm run test:transaction-workflow-model
npm run build
```
