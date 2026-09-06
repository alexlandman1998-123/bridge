# Agent module Phase 7 — controlled pilot boundary

Phase 7 binds a current Phase 6 `GO` receipt to an inspected deployment, an immutable Git revision, one pilot organisation and named operational owners. It only creates a readiness receipt; it cannot deploy, enable a feature, apply a migration, seed data, send messages or write to production.

## Required controls

- Phase 6 must be `GO` and no more than 24 hours old.
- Deployed assets must pass the read-only deployment validator after the Phase 6 receipt was produced.
- The deployment origin must use HTTPS and cannot be localhost.
- The source must be a full Git commit with a clean worktree.
- The pilot scope must contain exactly one organisation UUID.
- Pilot owner, change reference and rollback owner are mandatory.
- The receipt includes SHA-256 digests for both upstream evidence documents and the complete pilot envelope.

## Commands

Run the deterministic implementation gate:

```sh
npm run test:agent-phase7-pilot-boundary
npm run verify:agent-phase7
```

Capture the deployment evidence without changing it:

```sh
npm run validate:agent-deployment-phase7 -- --origin=https://app.arch9.co.za
```

After human review, evaluate the pilot boundary:

```sh
AGENT_PHASE7_PILOT_ORGANISATION_ID=00000000-0000-4000-8000-000000000000 \
AGENT_PHASE7_OWNER='Named owner' \
AGENT_PHASE7_CHANGE_REFERENCE='CHG-0000' \
AGENT_PHASE7_ROLLBACK_OWNER='Named rollback owner' \
AGENT_PHASE7_MONITORING_OWNER='Named monitoring owner' \
AGENT_PHASE7_SUPPORT_OWNER='Named support owner' \
AGENT_PHASE7_FEATURE_FLAG='agent_scale_pilot' \
AGENT_PHASE7_KILL_SWITCH_VERIFIED=true \
AGENT_PHASE7_ROLLBACK_TARGET_MINUTES=15 \
npm run check:agent-phase7-pilot
```

The result is written to `test-results/agent-phase7/pilot-boundary.json`. `HOLD` exits non-zero and lists all blockers. `READY_FOR_PILOT` confirms only that the defined boundary is complete; a separate authorized deployment or feature-activation workflow is still required.
