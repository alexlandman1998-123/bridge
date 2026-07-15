# Cancellation attorney module - Phase 1 usability pass

Phase 1 closes the first Phase 0 blocker: `cancellation_lane_usability_not_simplified`.

It makes the existing cancellation lane easier to operate without adding document generation, lender integrations, Deeds Office integrations, migrations, production writes or legal wording changes.

The executable source is `src/core/transactions/cancellationAttorneyModulePhase1.js`. The existing cancellation command centre now carries this Phase 1 usability payload through `src/core/transactions/attorneyCancellationWorldClassCockpit.js`.

## What changed

- Added a cancellation-specific role-focused cockpit model.
- Grouped the 19 cancellation stages into six human work domains:
  - instruction and existing bond
  - figures and expiry
  - guarantees
  - documents and signing
  - lodgement and registration
  - settlement and close-out
- Added a cancellation action sequence:
  - confirm
  - request
  - upload
  - review
  - reconcile
  - sign
- Merged stage-level cancellation document keys with the richer cancellation document resolver requirements.
- Surfaced the current mismatch between stage documents and resolver documents instead of hiding it.
- Added per-document owner, status, risk tier, strategy, reason, next action and action map.
- Added next actions for assignment, missing data, evidence review, document requests, coverage warnings, linked handoff blockers and read-only lanes.
- Added explicit Phase 1 safety controls.

## Important usability fix

Before Phase 1, the stage list and the richer document resolver did not expose the same cancellation requirements.

The stage-level list includes:

- seller bond cancellation information
- cancellation figures
- guarantee letter
- seller signed cancellation documents

The richer document resolver includes:

- cancellation instruction
- existing bond account details
- cancellation figures
- cancellation guarantees
- bank cancellation documents
- cancellation consent
- proof of settlement

Phase 1 shows the union of these requirements in the cockpit and separately reports which requirements came from only one side. That gives the conveyancer a full working list while preserving the audit trail for Phase 2 and later cleanup.

## Phase 1 boundary

This phase intentionally does not:

- generate operational cancellation documents
- generate legal instruments
- approve bank cancellation forms
- request external figures automatically
- accept guarantees automatically
- mark registration from stage text alone
- reconcile settlement
- write to external systems
- mutate the matter

Those stay in later phases.

## Why this helps the cancellation attorney

The cancellation attorney no longer has to mentally stitch together raw stages, document requirements, signing requirements and linked transfer/bond handoffs.

The Phase 1 cockpit answers:

- Where am I in the cancellation?
- Which domain is active?
- Which cancellation documents are missing or ready for review?
- Which richer resolver requirements are not named on stages?
- Which stage-only documents still matter?
- What is the next best action?
- Can I act, or is this lane read-only for me?

## Acceptance check

Run:

```bash
npm run test:cancellation-attorney-module-phase1
```

Phase 1 is complete when Phase 0 still passes, all 19 stages are domain-mapped, the union of cancellation requirements is visible, resolver-only and stage-only document coverage is surfaced, next actions are produced, the existing cancellation cockpit carries the Phase 1 payload, and all generation/external-write boundaries remain blocked.
