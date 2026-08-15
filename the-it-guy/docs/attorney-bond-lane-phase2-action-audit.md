# Bond Lane Phase 2 Action Audit

Phase 2 maps the bond originator and bond attorney journey into concrete action surfaces without changing persistence or live workflow mutation.

## Originator Actions

Bond originator mutation stays in the bond-file workspace:

- `bond_file_application` for application review
- `bond_file_documents` for document request and review
- `bond_file_workflow` for bank submission, feedback, offers, grant, signed grant, grant submission, and attorney instruction
- `bond_file_activity` for read-only registration monitoring

The attorney workspace may display originator progress, but it remains read-only for originator-controlled bank and grant actions.

## Attorney Actions

Bond attorney mutation stays in the attorney workflow:

- `attorney_workflow_action_panel` for step completion, document requests, notes, and signing commands
- `attorney_workflow_progress` for non-linear stage updates

The audit keeps the workflow non-sticky: bond attorneys can work any applicable stage without forcing completion of every previous stage.

## Handoffs

The audit requires action coverage for:

- `originator_to_bond_attorney`
- `bond_attorney_to_transfer_attorney`
- `bond_attorney_to_lodgement_coordination`

The originator attorney-instruction action is executed from `bond_file_workflow`, then observed in the attorney handoff surface. The `originator_attorney_handoff` surface is read-only evidence inside the attorney workspace.

## Verification

Run:

```bash
node scripts/verify-attorney-bond-lane-phase2.mjs
```

The verifier fails if required source actions disappear, action surfaces are missing, bond attorney stage coverage regresses, handoff coverage disappears, or originator mutation leaks into read-only attorney surfaces.
