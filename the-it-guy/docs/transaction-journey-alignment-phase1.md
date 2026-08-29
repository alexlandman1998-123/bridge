# Transaction journey alignment: Phase 1 audit and stabilisation

## Outcome

Phase 1 freezes the transaction-journey vocabulary, inventories every live surface, records the parity scenarios, and stabilises the agent transaction loader. It deliberately does not switch production portals to a new contract; that is Phase 2.

The machine-readable audit is in `docs/transaction-journey-alignment-phase1.json` and is enforced by `scripts/transaction-journey-alignment-phase1.test.mjs`.

## Finding

There is no single journey presentation authority today:

- `AttorneyTransactionDetail.jsx` builds a five-stage agent journey and retains a regex fallback over transaction text.
- `ClientPortal.jsx` builds a six-step buyer journey from the legacy main stage plus finance and attorney process payloads.
- `TransactionStageWorkspace.jsx` owns an eleven-stage seller transaction model.
- `TransactionLifecycleProgress.jsx` can receive a rollup summary or recompute from legacy transaction fields, depending on its caller.
- `ExternalTransactionPortal.jsx` and `TransactionStatusShare.jsx` interpret their own payloads.
- `BondOriginatorAgentProgressView.jsx` is a valuable specialist finance tracker, but it is not the macro transaction journey.
- `ProspectBuyerDemo.jsx`, shown in the supplied reference, is a static demo fixture rather than live transaction workflow data.

The existing server rollup is the correct authority boundary. It already exposes the parent stage, active workflow, active step, blockers, next action, progress and derivation timestamp.

## Frozen milestone vocabulary

All live transaction portals will converge on:

1. OTP Signed
2. Finance
3. Guarantees
4. Transfer
5. Lodgement
6. Registration

The macro milestone and direct workflow item are separate concepts. For example:

- Macro milestone: `Finance`
- Direct workflow item: `Waiting for bank quotes`
- Operational owner: `Bond Originator`

Parallel legal and finance work must not make the macro journey move backwards. A concurrent task can become the displayed workflow item while the canonical milestone remains monotonic.

## Current-stage box

Phase 2 must derive the box below the tracker from the rollup's active workflow step, not from portal-specific copy or transaction-stage regexes. Every snapshot must carry the same:

- milestone key;
- workflow item key;
- status;
- progress percentage;
- snapshot version; and
- derived timestamp.

Audience copy is a controlled projection. Buyer and seller portals may hide internal notes, bank values, private contact information or internal assignee detail, but they may not change the workflow meaning.

## Loading stabilisation

The agent transaction loader now:

- deduplicates an in-flight foreground load for the same transaction id;
- renders as soon as the core transaction shell resolves; and
- allows rollup, documents, activity and other secondary data to hydrate without retaining a blank full-page state.

This is the required baseline for Phase 2. Journey data may enrich the page after core data, but it must not gate the entire transaction workspace.

## Acceptance matrix

The Phase 1 fixture covers bond quotes, guarantee issuance, rates clearance, simultaneous lodgement preparation, Deeds Office lodgement, registration, cash proof of funds and blocked OTP signature. Phase 2 tests must run every scenario through every applicable audience projection and assert semantic parity.

## Phase 2 boundary

Phase 2 should add a versioned `transactionJourneySnapshot` to the rollup response and a pure audience projection layer. It should not begin by replacing portal UI components. The data contract and parity tests come first; shared rendering follows once every current surface can consume the same snapshot.

## Verification

```bash
npm run test:transaction-journey-phase1
npm run test:transaction-workflow-rollup
node src/core/clientPortal/__tests__/buyerJourneyPresentationModel.test.js
node scripts/buyer-portal-phase3-canonical-journey.test.mjs
npx eslint src/pages/AttorneyTransactionDetail.jsx --quiet
```
