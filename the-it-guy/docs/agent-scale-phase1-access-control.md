# Agent scale readiness — Phase 1 access control

Phase 1 provides a fail-closed authenticated staging acceptance path for tenant and branch isolation. It does not change the Agent API and does not automatically apply database migrations.

## Implemented controls

- A read-only staging migration attestation for `20260906065759_agent_phase2_rls_acceptance.sql`.
- Six required authenticated actors: Agent, principal, branch manager, restricted Agent, inactive Agent and multi-membership Agent.
- Explicit denied-organisation probes across every organisation-bearing Agent table.
- Explicit denied-branch probes for the branch-manager fixture.
- Assignment-only commission checks and participant-to-transaction consistency checks.
- Non-anonymous session enforcement.
- Evidence minimisation: user, organisation and branch IDs are stored only as truncated SHA-256 fingerprints.

## Commands

Repository contract and the cumulative Phase 0 gate:

```sh
npm run verify:agent-scale-phase1
```

Read-only migration attestation followed by live actor acceptance:

```sh
npm run acceptance:agent-scale-phase1
```

## Current staging finding

The read-only migration listing on 6 September 2026 did not contain `20260906065759`, while later migration `20260906070110` was present. Do not apply the missing migration blindly. Reconcile the staging migration history through the normal reviewed database release process, then rerun the attestation and six-actor acceptance.

Phase 1 implementation is complete, but its operational exit status remains **HOLD** until both commands pass with controlled staging fixtures.
