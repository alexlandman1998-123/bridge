# Attorney release readiness — Phase 8 controlled cutover

## Objective

Prepare a deliberately small and reversible production canary after the final Phase 7 release decision. Phase 8 planning never deploys, promotes, enables a cohort, changes Supabase, or rolls back production.

## Required inputs

- An immutable, read-only Phase 7 `GO` receipt whose fingerprint still verifies.
- A preview deployment built from the exact Phase 7 release fingerprint.
- A completed browser smoke against that preview.
- A known-good rollback deployment whose rollback procedure has been tested.
- One to three canonical attorney-organisation UUIDs.
- Named monitoring and rollback owners.
- Accountable approval bound to the release fingerprint and deployment ID.
- Exact confirmation: `AUTHORIZE_ATTORNEY_CANARY_CUTOVER`.

## Plan command

Copy the candidate and approval examples into the private output directory, complete them, and run:

```bash
npm run plan:attorney-release-phase8 -- \
  --phase7-receipt=output/attorney-release/phase7-go.json \
  --candidate=output/attorney-release/phase8-candidate.json \
  --approval=output/attorney-release/phase8-approval.json
```

The generated plan contains a cohort digest and count, not raw organisation IDs. It records `mutatedProduction: false` and `deploymentPerformed: false`.

## Execution boundary

`READY_FOR_CANARY` is a prerequisite, not permission for an unattended deployment. Actual execution must preserve this sequence:

1. Promote the already verified preview artifact.
2. Enable only the approved canary cohort using an established server-side rollout control.
3. Run authenticated browser smoke tests for all three attorney roles.
4. Verify production propagation and destination visibility.
5. Observe errors, action reliability, and propagation latency.
6. Roll back immediately on any security, visibility, integrity, permission, or propagation failure.

The repository currently has no attorney-specific server-side production cohort control. That control must exist and be verified before cutover execution is introduced; Phase 8 does not substitute a client-exposed environment variable.

## Current result — 2026-09-05

Phase 8 is implemented and its cumulative contract suite passes. The current plan is `BLOCKED`, as intended, because Phase 7 remains `NO_GO` and no production candidate, canary cohort, rollback deployment, or cutover approval has been supplied. Production was not touched.
