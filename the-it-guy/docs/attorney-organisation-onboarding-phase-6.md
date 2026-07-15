# Attorney organisation onboarding — Phase 6

## Outcome

Phase 6 cuts attorney runtime identity and branding reads over to the backing `organisations` row.

`attorney_firms` continues to provide operational firm fields and remains a compatibility projection during rollout. Shared values now resolve in this order:

1. backing `organisations` identity and branding;
2. legacy `attorney_firms` and `attorney_firm_branding` values only when a canonical field is unavailable during a mixed-version deployment.

The central `attorneyFirms` service performs one batched organisation query for firm lists, so dashboard, workspace selection, firm settings, and other consumers receive the same canonical projection without N+1 organisation reads.

Firm settings writes are canonical-first. The service updates `organisations`, then maintains the legacy mirror for compatibility. Phase 3's database projection remains the rollback safety net and keeps intentional clears aligned.

## Compatibility boundary

Before the Phase 2 and Phase 3 migrations are deployed, missing organisation columns or a missing backing row use the existing legacy write path. Unexpected canonical write errors, including access-control failures, are not hidden.

## Verification

```sh
npm run test:attorney-organisation-phase6
```

The Phase 5 readiness verifier also treats the Phase 6 projection as a required static release contract.

