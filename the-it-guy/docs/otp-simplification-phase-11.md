# OTP simplification — Phase 11 workspace consolidation

Phase 10 completes the governed OTP lifecycle. Phase 11 does not add another legal or operational state. It makes the completed lifecycle understandable in one small workspace journey.

## One operational journey

The simplified OTP workspace exposes three stages:

1. **Audit** — run the read-only Phase 8 evidence check.
2. **Notify** — review and explicitly apply the Phase 9 human follow-up plan.
3. **Resolve** — run the read-only Phase 10 closure check.

Only the selected stage is visible. Each stage retains its existing status, detail and action controls, while the stage switcher shows enough progress to make the next step obvious.

After a new audit, the journey moves to Notify when actionable findings exist and to Resolve when no notification plan is needed. After notifications are applied, it moves to Resolve.

## Safety boundary

Phase 11 is presentation and navigation only. It does not change audit rules, notification fingerprints, recipient routing, acknowledgement SLAs, resolution rules, template governance, signing release or recovery.

No migration is required and no deployment is performed by this phase.

## Verification

```bash
npm run test:otp-consolidation-phase11
```

