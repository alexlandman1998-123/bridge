# Agent scale Phase 7 — controlled pilot

Phase 7 creates a read-only `READY_FOR_PILOT` or `HOLD` receipt. It does not deploy, activate a feature flag, apply migrations, seed data, contact users, or write production records. API redesign remains outside this brief.

The pilot can be ready only when:

- a Phase 6 `GO` receipt is less than 24 hours old and contains valid SHA-256 fingerprints for configuration, RLS, performance and all three browser-role reports;
- deployment validation passes after Phase 6 and confirms Calendar scale instrumentation;
- the deployed release manifest ID exactly matches the clean 40-character Git source revision;
- the origin is non-local HTTPS;
- the cohort contains exactly one explicit organisation UUID;
- the pilot, monitoring, support and rollback owners plus a change reference are named;
- an explicit feature flag is named, its kill switch is verified, and rollback is targeted within 15 minutes.

Run `npm run verify:agent-scale-phase7` for the deterministic implementation gate. After Phase 6 is genuinely `GO`, capture deployment evidence and run `npm run check:agent-phase7-pilot` with the environment fields documented in [the original pilot runbook](./agent-phase7-controlled-pilot.md). Any mismatch produces `HOLD`.
