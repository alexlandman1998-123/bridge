# Transfer Attorney Phase 9 UAT And Release Gate

Phase 9 closes the transfer attorney rollout proof. It does not add new transfer workflow stages; it verifies that the current lane can be used by a transfer attorney across the core matter structures.

## Release Decision

The runtime source of truth is `buildTransferWorkspaceViewModel(...).rolloutStatusSummary`.

- `go`: all action buttons are present, concurrent work is allowed, evidence gates are active, and scenario coverage is complete.
- `review`: the lane can be tested, but captured matter facts or queue state need review.
- `blocked`: required action routes or workflow guardrails are missing.

## UAT Walkthrough

The runtime UAT pack is `buildTransferWorkspaceViewModel(...).uatReport`.

Required walkthrough:

1. Open the authority task and confirm buyer/seller capacity requirements.
2. Run a missing-document command from the lane command queue.
3. Upload or review evidence on a document-backed task.
4. Move an out-of-sequence task to waiting or blocked without locking other work.
5. Confirm a task cannot be completed until required evidence is ready.
6. Schedule buyer or seller signing from a signing task.
7. Confirm finance and cancellation routing match the matter facts.

## Scenario Coverage

The Phase 9 verifier covers:

- cash individual buyer/seller
- married natural person capacity
- company and trust authority
- bond, cash, and hybrid finance routes
- seller existing bond and cancellation routing
- unknown facts remaining in `review`, not `go`

## Verification

Run:

```bash
node scripts/verify-attorney-workflow-phase9.mjs
```

The verifier fails if required action buttons disappear, transfer coverage wiring is removed, scenario coverage regresses, or completion can bypass required evidence.
