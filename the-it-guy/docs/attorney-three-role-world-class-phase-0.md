# Attorney three-role world-class programme — Phase 0 baseline

Phase 0 turns the transfer, bond and cancellation assessment into an executable contract. It does not claim that the current production topology is launch-ready.

## Canonical responsibility boundary

| Role | Appointment authority | Primary outcome | Owns |
| --- | --- | --- | --- |
| Transfer attorney | Seller | Coordinated transfer from instruction to registration | Transfer instruction, FICA/entity readiness, transfer documents, lodgement/registration and cross-lane coordination |
| Bond attorney | New lending bank | Bank-compliant bond registered in sync with transfer | Bank instruction, conditions, bond documents, guarantees and bond registration |
| Cancellation attorney | Existing bank | Existing bond discharged without hidden transfer delays | Cancellation instruction, figures, guarantee requirements, consent and cancellation registration |

The executable source is `src/core/transactions/attorneyThreeRoleWorldClassBaseline.js`; appointment and instruction authority remains canonical in `legalRoleCoordinationContract.js`.

## Scenario and pilot baseline

The automated matrix covers ten scenarios: cash, bond, hybrid, trust/company/development, commercial VAT, missing finance data, appointment replacement, expired cancellation figures, failed bank conditions and Deeds Office relodgement. Every scenario asserts the roles and documents produced by the real resolver.

Three deterministic pilot fixtures establish the minimum topology:

1. Transfer-only matter.
2. Transfer plus bond matter with distinct firms and users.
3. Full three-role matter with a distinct firm and user for every role.

The fixture identifiers are synthetic and must never be treated as production seed data.

## Current release blockers

- Non-demo required-role assignment coverage must reach the pilot threshold.

These blockers are machine-readable in `ATTORNEY_THREE_ROLE_RELEASE_BLOCKERS`. Later phases must close them rather than removing the assertions.

The live Phase 0 check on 2026-07-15 confirmed that all six legal-role migrations (`202607150008` through `202607150013`) and `legal_role_coordination_assurance_v1` are present.

Phase 2 subsequently introduced the first-class cancellation persona and removed temporary shared-lane editing. Its database enforcement becomes live when migration `202607150015` is applied.

## Evidence commands

Run the local baseline:

```bash
npm run test:attorney-three-role-phase0
```

Run the read-only report against the linked Supabase project:

```bash
npm run report:attorney-three-role-readiness
```

The report returns required-role counts alongside lane, assignment and role-player coverage, then reports active firm/member counts and legal-role migration topology. It performs no writes.

## Phase 0 exit gate

Phase 0 is complete when the scenario contract, responsibility matrix, pilot topology and readiness query all pass locally. Production gaps remain explicit inputs to Phases 1, 2 and 7.
