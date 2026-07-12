# Attorney Workflow Phase 4 Multi-Firm Smoke

Implemented on 2026-07-12.

## Goal

Implement the strict live staging smoke harness for a real transaction with transfer, bond, and cancellation attorney lanes assigned across firms. This phase proves the platform can carry a multi-lane attorney matter without losing assignment, lane, visibility, or cross-firm denial guarantees.

## Commands

Local contract and prerequisite verification:

```bash
npm run verify:attorney-workflow-phase4-multi-firm-smoke
```

Strict live staging evidence:

```bash
npm run verify:attorney-workflow-phase4-live
```

## Strict Live Evidence

The strict live command is read-only and requires `--live --confirm-staging --require-live` through the package script. It refuses to run outside the approved staging Supabase project.

Required staging placeholders:

| Evidence | Env key |
| --- | --- |
| Supabase project ref | `ATTORNEY_WORKFLOW_PHASE4_SUPABASE_PROJECT_REF` |
| Staging transaction | `ATTORNEY_WORKFLOW_PHASE4_TRANSACTION_ID` |
| Transfer firm | `ATTORNEY_WORKFLOW_PHASE4_TRANSFER_FIRM_ID` |
| Bond firm | `ATTORNEY_WORKFLOW_PHASE4_BOND_FIRM_ID` |
| Cancellation firm | `ATTORNEY_WORKFLOW_PHASE4_CANCELLATION_FIRM_ID` |
| Transfer attorney persona | `ATTORNEY_WORKFLOW_PHASE4_TRANSFER_EMAIL`, `ATTORNEY_WORKFLOW_PHASE4_TRANSFER_PASSWORD` |
| Bond attorney persona | `ATTORNEY_WORKFLOW_PHASE4_BOND_EMAIL`, `ATTORNEY_WORKFLOW_PHASE4_BOND_PASSWORD` |
| Cancellation attorney persona | `ATTORNEY_WORKFLOW_PHASE4_CANCELLATION_EMAIL`, `ATTORNEY_WORKFLOW_PHASE4_CANCELLATION_PASSWORD` |
| Unrelated denial persona | `ATTORNEY_WORKFLOW_PHASE4_UNRELATED_EMAIL`, `ATTORNEY_WORKFLOW_PHASE4_UNRELATED_PASSWORD` |

The live harness checks:

- transaction exists in staging
- active transfer, bond, and cancellation attorney assignments exist
- each assignment is firm-bound and lane-editable
- at least two distinct attorney firms are represented
- transfer, bond, and cancellation workflow subprocesses exist
- assigned attorney personas can see the transaction
- unrelated persona cannot see the transaction or attorney assignments

## Current Result

Local harness implementation is complete.

Verification on 2026-07-12:

- `npm run verify:attorney-workflow-phase4-multi-firm-smoke` passed with status `READY_LOCAL_CONTRACT`.
- `npm run verify:attorney-workflow-phase4-live` passed static checks and the Phase 3 aggregate prerequisite, then correctly blocked because the current environment does not provide the required Phase 4 staging fixture values.

Strict live evidence still requires real staging fixture values and persona credentials.

Phase 5 signing appointment workflow is implemented in `docs/audits/attorney-workflow-phase5-signing-appointments.md`.

## Acceptance

- [x] Local Phase 4 contract command exists.
- [x] Strict live package command exists.
- [x] Phase 4 reuses the Phase 3 aggregate launch gate as a prerequisite.
- [x] Strict live harness validates transfer, bond, and cancellation assignments.
- [x] Strict live harness validates workflow lanes.
- [x] Strict live harness validates assigned-persona visibility and unrelated-user denial.
- [x] `.env.example` declares the required staging evidence placeholders.

Decision: PHASE 4 HARNESS IMPLEMENTED; STRICT LIVE MULTI-FIRM EVIDENCE REQUIRED.
