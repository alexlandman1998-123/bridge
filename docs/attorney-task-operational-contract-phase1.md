# Attorney Task Operational Contract — Phase 1

Date: 2026-09-01

## Outcome

All 73 transfer, bond-registration, and bond-cancellation stages now expose one versioned operational contract. The contract is generated from the canonical attorney workflow definitions and is used by the existing atomic step mutation path.

No parallel workflow engine or task table was introduced.

## Contract

Every legal task declares:

- task type and primary action;
- allowed work and status actions;
- required structured inputs, documents, and evidence;
- completion, dependency, and due-date policies;
- attorney ownership;
- internal, professional, and client visibility policy;
- buyer/seller audience targeting for client-safe projections;
- status-to-event mappings.

The contract version is `attorney_task_operational_v1`.

## Mutation path

`updateAttorneyWorkflowStepStatus` now:

1. resolves the canonical task definition;
2. validates the requested status action against its operational contract;
3. generates a normalized operational work packet;
4. calls the existing `bridge_update_attorney_workflow_step` RPC;
5. preserves the existing atomic lane, lifecycle, history, and transaction-event update;
6. publishes the existing shared transaction progress projection.

The work packet includes the contract version, task type, status action, event key, and client audience. Buyer/seller portal activity filtering reads this audience so a buyer-specific legal update is not displayed in the seller feed, and vice versa.

## Privacy defaults

- Internal tasks remain internal.
- Professional-shared tasks remain visible to authorised professional participants.
- Client-safe tasks identify `buyer`, `seller`, or `buyer_and_seller` audiences.
- Client projections contain safe workflow wording, not internal notes, document contents, or evidence rules.

## Verification

Run:

```bash
cd the-it-guy
npm run test:attorney-task-operational-contract
node scripts/attorney-workflow-phase1-foundation.test.mjs
node scripts/shared-transaction-progress-contract.test.mjs
node scripts/transaction-shared-progress-phase2.test.mjs
```

The focused contract test verifies all 73 legal tasks plus buyer/seller audience separation.
