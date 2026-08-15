# Bond Lane Phase 3 Stage Commands

Phase 3 makes bond attorney actions operationally specific while keeping the existing workflow save paths.

## What Changed

Bond attorney actions now generate stage-specific commands for the canonical bond-registration stages. The UI still opens the existing workflow drawer forms, but the command label, checklist, audience, visibility, and prefilled note are tailored to the selected bond stage.

Examples:

- `bank_conditions_outstanding` opens a note command labelled **Capture Conditions** instead of forcing a completion step.
- `bank_approval_to_lodge_received` opens a completion command labelled **Confirm Approval To Lodge** with approval-reference checks.
- `guarantees_issued` opens **Confirm Guarantees Issued** with value, wording, expiry, and delivery-evidence checks.
- `bond_lodgement_ready` opens **Mark Bond Ready** with simultaneous-lodgement checks.
- `bond_lodged` opens **Mark Bond Lodged** with lodgement-date and deeds-reference checks.

## Non-Linear Handling

The attorney can still open any bond workflow stage from the progress view and update it directly. Phase 3 does not add a sticky dependency chain. The command preset follows the stage the attorney selected or the current active stage.

## Boundaries

- Originator-side bank submissions, offers, grants, and attorney instruction remain in the bond originator file workspace.
- Attorney-side originator panels remain read-only evidence and navigation surfaces.
- Bond attorney commands reuse existing stage update, note, document request, and signing persistence.

## Phase 4 Candidates

- Add explicit cross-lane guarantee wording acceptance workflow between bond attorney and transfer attorney.
- Add exact deep links from read-only originator cards into matching bond file tabs/actions.
- Add higher-level bond attorney dashboard grouping for bank conditions, guarantees, lodgement, and registration.

## Verification

Run:

```bash
node scripts/verify-attorney-bond-lane-phase3.mjs
```
