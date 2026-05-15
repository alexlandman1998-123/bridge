# Attorney Transaction Workflow Phase 2 Notes

Date: 2026-05-15

## Implemented Foundation

- Normalized `transaction_attorney_assignments` with canonical transaction-level roles:
  - `transfer_attorney`
  - `bond_attorney`
  - `cancellation_attorney`
- Preserved legacy assignment fields for backward compatibility:
  - `firm_id`
  - `assignment_type`
  - `department_id`
  - `primary_attorney_id`
  - `status`
- Added canonical fields for Phase 2:
  - `attorney_firm_id`
  - `attorney_user_id`
  - `attorney_department_id`
  - `attorney_role`
  - `assignment_status`
  - `is_primary`
  - assignment permission flags
- Added constraints/indexes for:
  - one active primary attorney per transaction role
  - one active assignment per transaction role/user pair
  - multiple supporting attorneys per role
- Backfilled existing assignment rows and split legacy `transfer_and_bond` rows into a bond canonical assignment where required.
- Updated assignment services with canonical helpers and compatibility aliases.
- Added service-level assignment write permission checks for attorney firm admins/director partners/firm owners.
- Added internal transaction activity events for assignment create/update/remove/replacement.
- Added role-specific assignment display/editing in the attorney transaction workspace.
- Added conditional assignment display:
  - transfer always available
  - bond visible for bond/hybrid/combination finance
  - cancellation visible when current transaction fields indicate cancellation/existing seller bond, or when already assigned

## Important Boundaries

- Full workflow lanes were not added in this phase.
- Cancellation workflow subprocesses were not created yet.
- Document readiness, blocker, and client-facing legal update engines were not changed.
- Existing legacy assignment fields remain mirrored until downstream screens are fully migrated.

## Verification

### Targeted Lint

Command:

```bash
npx eslint src/services/transactionAttorneyAssignments.js src/lib/attorneyPermissions.js src/components/attorney/assignments/AttorneyAssignmentSection.jsx src/components/attorney/assignments/AttorneyAssignmentForm.jsx src/components/attorney/assignments/AttorneyAssignmentSummaryCard.jsx src/components/attorney/branding/AttorneyFirmRolePlayerCard.jsx src/pages/AttorneyTransactionDetail.jsx
```

Result:

- Passed with 0 errors.
- Existing warnings remain in `AttorneyTransactionDetail.jsx` for hook dependencies.

### Build

Command:

```bash
npm run build
```

Result:

- Passed.
- Existing warnings remain:
  - CSS minifier warning around generated CSS `-: TZ.;`
  - Rollup chunk size warning for the main JS bundle.

### Full Lint

Command:

```bash
npm run lint
```

Result:

- Failed with existing repo-wide lint debt:
  - `126 problems (95 errors, 31 warnings)`
- No new targeted lint errors were introduced in the Phase 2 touched files.

## Phase 3 Readiness Notes

Phase 3 can now build attorney workflow lanes against the canonical assignment roles. Recommended next steps:

- Add `cancellation` to workflow lane definitions and subprocess templates.
- Replace remaining generic attorney participant lane-edit checks with canonical assignment checks.
- Make attorney document requests lane-aware with `attorney_role` / assignment links.
- Add normalized transaction condition fields for seller existing bond and cancellation requirement.
