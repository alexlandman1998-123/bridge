# Phase 27 — Configure the Controlled Pilot Cohort

## Status

**BLOCKED_PENDING_GENUINE_N4_EVIDENCE**

The production cohort is locked to one reviewed organisation: Kingstons Real Estate (`ec19d0a6-bcba-4eef-aa72-9972de88204d`). It is an active agency with seven active members, two active administrators, and five existing document packets. Production currently has no N6 control or enrolment.

The release was not activated because the production N4 launch-health gate is not ready. Only two genuine document-experience events exist: one desktop agent Mandate journey view and one primary action. Enabling enforcement now would bypass the repository's own rollout safety contract.

## Missing evidence

Real controlled journeys must add:

- OTP coverage;
- signer-portal coverage;
- mobile coverage;
- principal, attorney, seller, and buyer audiences.

Synthetic telemetry, service-role inserts, or fabricated user journeys do not qualify.

## Implemented guardrail

`scripts/phase27-controlled-pilot-cohort.mjs` now provides the production operator. It:

1. refuses any project except production `isdowlnollckzvltkasn`;
2. refuses any organisation except the reviewed Kingstons cohort;
3. checks active membership, administrator coverage, participant ceiling, document history, telemetry privacy, N4 coverage, and the current N6 revision;
4. requires `PHASE27_PILOT_WRITE=true`, exact project/cohort confirmations, an accountable operator, and a real change reference;
5. creates a 24-hour pilot observation window with a 48-hour hard expiry only after N4 returns `CONTINUE_CONTROLLED_ROLLOUT`;
6. verifies the applied cohort through `bridge_document_experience_runtime_access_n6`;
7. leaves Vercel enforcement as the final, separately verified step so the database control always exists before the frontend fails closed.

## Current safe command

Read-only preflight:

```bash
node --env-file=the-it-guy/.env.production.local scripts/phase27-controlled-pilot-cohort.mjs \
  --project-ref=isdowlnollckzvltkasn \
  --organisation-id=ec19d0a6-bcba-4eef-aa72-9972de88204d
```

The guarded apply command must not be used until the preflight returns `DRY_RUN_READY`.

## Activation sequence after N4 passes

1. Run the operator with its write flag and exact confirmations.
2. Verify the enrolled organisation is allowed and a non-enrolled organisation is denied.
3. Add `VITE_DOCUMENT_EXPERIENCE_ROLLOUT_MODE=enforced` and `VITE_DOCUMENT_EXPERIENCE_ROLLOUT_ENVIRONMENT=production` to Vercel production.
4. Redeploy the already-certified application commit.
5. Verify the enrolled workspace is open, unrelated workspaces fail closed, the kill switch works, and production logs remain clean.

## Safety boundary

Phase 27 did not create a control row, change Vercel configuration, redeploy production, impersonate users, generate synthetic evidence, or modify database content. The Phase 0 migration freeze remains active.
