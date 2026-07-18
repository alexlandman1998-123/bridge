# Attorney role integrity and rollout gate — Phase 8

## Outcome

Phase 8 adds a read-only release gate after the Phase 7 authorization cutover. It does not repair, delete, rewrite, or remove attorney membership data. It identifies the records that must be resolved before compatibility cleanup can proceed.

## Integrity projection

Migration `202607180041_attorney_role_integrity_gate_phase8.sql` creates the security-invoker view `attorney_role_integrity_v1`. For each visible attorney membership it checks:

- the derived compatibility role matches the canonical professional profile;
- an organisation-user extension is linked;
- the organisation extension mirrors professional role, qualifications, compatibility role, and member identity;
- every open individual transaction assignment remains eligible for the member's professional role, qualifications, and assignment slot.

The view relies on existing RLS and exposes no profile or auth metadata.

## Gate behavior

The release gate blocks compatibility cleanup when it finds:

- an ineligible pending, active, or paused assignment;
- a compatibility-role mismatch;
- a missing organisation extension;
- an organisation-extension mismatch;
- no visible rows, because absence of evidence is not treated as a successful audit.

The report is explicitly `dryRun: true`. Corrective actions remain operator-reviewed and outside this phase.

## Operations

Run the contract test:

```bash
npm run test:attorney-role-integrity-phase8
```

After deploying migration `202607180041`, run the live audit:

```bash
npm run audit:attorney-role-integrity -- --strict
```

Use `--firm-id <uuid>` to scope the report to one firm. Strict mode exits non-zero unless the gate passes.

## Phase 9 handoff

Phase 9 may proceed only after the strict gate passes for the intended rollout population. Compatibility columns and profile mirrors must not be removed based solely on application tests.
