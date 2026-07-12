# Legal Suspensive Condition Workflow Gates Phase 6

Date: 2026-07-11

## Purpose

Phase 6 adds first-class workflow gates for suspensive conditions. The system can now distinguish between a condition that is merely mentioned in the OTP text and a condition that has a tracked deadline, a valid extension, or a recorded fulfilment/waiver before transfer and registration advance.

## Implemented Behavior

- Suspensive-condition facts are extracted from `conditions_json`, `conditionsJson`, `suspensive_conditions`, flat subject-to-sale flags, inspection flags, and deposit-condition flags.
- `suspensive_condition_deadlines_current` verifies that each active condition has a deadline or a valid extended deadline.
- Expired conditions block unless they are fulfilled, waived, or extended with recorded extension evidence.
- `suspensive_condition_resolutions_ready` verifies that each active condition is fulfilled or waived before transfer/registration progression.
- A future-dated unresolved condition may move from OTP into finance tracking, but cannot move into transfer until fulfilled or waived.
- Workflow action validation now applies hard blockers to `MOVE_TO_FINANCE`, `MOVE_TO_TRANSFER`, `MARK_READY_FOR_REGISTRATION`, and `MARK_REGISTERED` based on the target stage.
- The workflow transaction read model now tries a condition-aware select first and falls back to legacy transaction fields when optional condition columns are missing.

## Gate Semantics

- Finance handoff requires condition deadlines to be current.
- Transfer and registration require condition deadlines to be current and condition resolutions to be ready.
- Written waiver/extension evidence can be represented by a reason, signed/approved timestamp, or linked document/evidence id.
- Fulfilment can be represented by fulfilment status, fulfilment timestamp, or linked evidence/document id.

## Locked Examples

- Subject-to-sale with a future deadline passes the deadline gate but fails the resolution gate.
- Subject-to-sale with no deadline blocks finance handoff.
- An expired inspection condition blocks transfer unless fulfilled, waived, or extended.
- An expired subject-to-sale condition with a future extended deadline and extension document passes deadline tracking but still blocks transfer until resolved.
- A waived condition with a written waiver reason passes both gates.
- A real `MOVE_TO_TRANSFER` workflow action is blocked by `SUSPENSIVE_CONDITION_RESOLUTION_REQUIRED` until the condition is fulfilled with linked evidence.

## Touched Surfaces

- Suspensive-condition gate resolver: `server/workflows/suspensiveConditionWorkflowGates.js`
- Transaction gate registry: `server/workflows/transactionWorkflowGates.js`
- Workflow action validation: `server/services/workflowActionService.js`
- Workflow transaction read model: `server/services/transactionWorkflowModelService.js`
- Regression gate: `scripts/suspensive-condition-workflow-gates-phase6.test.mjs`
- Package command: `test:legal-suspensive-condition-gates`

## Verification

- `npm run test:legal-suspensive-condition-gates`
- `node server/tests/workflowActionService.test.js`
- `npm run test:legal-scenario-matrix`
- `npm run test:legal-support-boundary`
- `npm run test:legal-buyer-exceptional-capacity`
- `npm run test:canonical-workflow-gates`
- `npm run test:transaction-workflow-rollup`
- `npm run test:workflow-rollup-rules`
- `npm run test:transaction-workflow-model`
