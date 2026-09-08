# Phase 8 — cross-role acceptance and controlled release

This is the release gate for the shared journey phases 1–7, not the older transaction-sync fleet rollout.
No command here deploys code, applies migrations or modifies production.

## Local acceptance

From the application directory, run:

```sh
node scripts/shared-journey-acceptance.mjs
```

Provide `PGLITE_MODULE` if PGlite is installed outside this project. The runner executes the
contract, applicability, atomic-write, reader, view, refresh/reconnect, conversation and
reconciliation tests plus a production build. It prints a JSON report to stdout and progress
to stderr. Exit code 1 is expected when staging evidence is absent, even if every local test
passes. It fingerprints current source, server, migration, suite and build-configuration files,
including uncommitted files. A source change during verification fails the local gate.

Local SQL tests use isolated PostgreSQL fixtures; UI tests use mocked browser environments.
They do not establish that staging migrations, real authentication, Realtime or deployed UI work.

## Staging acceptance (required, not pre-filled)

Use disposable, explicitly authorised staging matters and separate signed-in browser sessions
for attorney, agent, developer, buyer and seller. Do not reset real transactions for testing.
Cover these profiles:

- Cash, individual, unmarried.
- Cash, individual, married in community of property.
- Bond, individual, married out of community of property.
- Bond, company.
- Hybrid, company.
- Transfer with an existing bond cancellation.

In each case exercise in-progress, waiting, blocked, completed, completed externally,
not applicable and reopening. Include tasks in each applicable transfer/bond/cancellation lane.
Use the actual Work controls, not direct database writes. Confirm task identifiers and applicable
counts match across Work, header, overview, dashboards and buyer/seller journeys. Completed
externally counts as completed; N/A is excluded; reopening reduces completion. Documents must
not be silently marked received by completing work externally.

Record before/after revisions and client-safe snapshot SHA-256 digests from all five roles.
Use the same canonical JSON serialization of `projectSharedMatterJourneyRead` for every role.
Observe each updated snapshot within 30 seconds of commit (including the 15-second polling
fallback). This measures RPC convergence; also record browser evidence for actual repainting.

Exercise all exported `SAFETY_CHECKS` in `scripts/shared-journey-release-gate.mjs`: private and
restricted audiences, revoked/other-matter access, retries and stale writes, network recovery,
background tabs, draft preservation, cross-role comments, reconciliation, migration alignment
and rollback rehearsal. Store redacted screenshots/logs outside source control. Do not put tokens,
names, message contents or document contents in release evidence.

## Evidence format and evaluation

The evidence is an **operator-attested record**, not an automated or cryptographically signed
proof. The runner validates completeness and consistency; it cannot authenticate screenshots or
prove that a person performed a check. Never manufacture observations to satisfy the gate.

Supply a JSON object with `schemaVersion: 1`, `environment: "staging"`, `projectRef` (20 characters),
`deploymentId`, `reviewedBy`, `sourceDigest` from the exact candidate's local report, and
`recordedAt` (UTC ISO timestamp). `transitions` contains one entry per exported scenario,
applicable lane and outcome (70 transitions across the six scenarios):

```text
scenario, laneKey, outcome, matterId, taskId, beforeRevision, afterRevision, committedAt,
reads: [{role, revision, taskId, taskStatus, snapshotDigest, observedAt}, ...all five roles]
```

For reopening, observed `taskStatus` is `not_started`; other outcomes use their status directly.
`checks` maps every exported safety-check name to `{status: "passed", evidenceRef: "..."}`.
Evidence must be no older than 24 hours and refer to the same code candidate. Any missing role,
revision mismatch, divergent digest, late observation, failed safety check or stale evidence
blocks release. Pass it using:

```sh
node scripts/shared-journey-acceptance.mjs --staging-evidence /secure/path/staging-evidence.json
```

## Controlled release

Only `ready_for_controlled_release` is a go recommendation, not deployment approval.
Before a separately authorised release, retain the previous deployment, verify backups and
migration history, deploy the exact reviewed candidate and its reviewed migrations, and run a
small authorised canary with representative matters. Check all five roles before expanding.
Stop for mismatched progress, missing tasks, access leaks, duplicate events or refresh failures.
Roll back application exposure to the previous compatible deployment; do not delete task events,
drop new tables or reverse data migrations blindly. Re-audit affected matters with Phase 7.

Live staging acceptance, production deployment and production data reconciliation remain
outstanding until actually performed and recorded.
