# Phase 28 — Execute the Pilot

## Status

**BLOCKED_PENDING_GENUINE_N4_EVIDENCE**

The production execution preflight was run for the single approved Kingstons Real Estate cohort. Activation was correctly withheld. Production still has only two genuine document-experience events, covering an agent opening and acting on a Mandate in the desktop workspace.

No N6 control was created, no Vercel rollout variables were added, no deployment was triggered, and production remains in shadow mode.

## Real journey matrix

Complete these journeys through the normal application and real accounts. One journey may satisfy several missing dimensions.

| Operator account | Device | Surface | Document | Minimum action |
| --- | --- | --- | --- | --- |
| Principal | Desktop | Workspace | Mandate | Open the journey and use its recommended action |
| Agent | Mobile | Workspace | OTP | Open the journey and use its recommended action |
| Attorney | Desktop | Workspace | Mandate | Open the assigned journey |
| Seller | Mobile | Signer portal | Mandate | Open the signer journey and use its recommended action |
| Buyer | Desktop | Signer portal | OTP | Open the signer journey and use its recommended action |

Do not insert telemetry manually. Do not use the service role to manufacture events. The gate requires events produced by the real application journey.

## Check readiness

```bash
node --env-file=the-it-guy/.env.production.local scripts/phase28-pilot-operations.mjs \
  --action=status \
  --project-ref=isdowlnollckzvltkasn \
  --organisation-id=ec19d0a6-bcba-4eef-aa72-9972de88204d
```

Continue only when the result is `READY_TO_START`.

## Start the bounded database control

```bash
PHASE28_PILOT_START=true node --env-file=the-it-guy/.env.production.local scripts/phase28-pilot-operations.mjs \
  --action=start \
  --project-ref=isdowlnollckzvltkasn \
  --organisation-id=ec19d0a6-bcba-4eef-aa72-9972de88204d \
  --confirm-project-ref=isdowlnollckzvltkasn \
  --confirm-organisation-id=ec19d0a6-bcba-4eef-aa72-9972de88204d \
  --operator="<accountable-person>" \
  --reference="<approved-change-reference>"
```

This reuses the Phase 27 gate and creates a 24-hour observation window with a 48-hour hard expiry. A successful result is `PILOT_DB_ACTIVE_PENDING_RUNTIME_ENFORCEMENT`.

## Enforce and observe

After the database control is active:

1. Set `VITE_DOCUMENT_EXPERIENCE_ROLLOUT_MODE=enforced` in Vercel production.
2. Set `VITE_DOCUMENT_EXPERIENCE_ROLLOUT_ENVIRONMENT=production` in Vercel production.
3. Redeploy only the certified Phase 26 application commit.
4. Confirm the Kingstons organisation is allowed and an unrelated organisation is denied.
5. Run `--action=observe` after each journey and at least at the beginning, midpoint, and end of the observation window.
6. Stop on privacy failure, fail-closed access mismatch, severe application errors, expiry, or an N4 `HOLD_AND_FIX` decision.

## Kill switch

```bash
PHASE28_PILOT_STOP=true node --env-file=the-it-guy/.env.production.local scripts/phase28-pilot-operations.mjs \
  --action=stop \
  --project-ref=isdowlnollckzvltkasn \
  --organisation-id=ec19d0a6-bcba-4eef-aa72-9972de88204d \
  --confirm-project-ref=isdowlnollckzvltkasn \
  --confirm-organisation-id=ec19d0a6-bcba-4eef-aa72-9972de88204d \
  --operator="<accountable-person>" \
  --reference="<incident-or-closeout-reference>"
```

After stopping, revert the Vercel rollout mode to `shadow` and redeploy the certified application commit. The database control is paused first so the frontend remains fail-closed during rollback.

## Completion criteria

Phase 28 completes only when the production cohort has run for the observation window, the enrolled and non-enrolled access checks are correct, telemetry remains privacy-safe, N4 stays healthy, no severe production incident remains open, and the pilot is explicitly closed or approved for expansion.
