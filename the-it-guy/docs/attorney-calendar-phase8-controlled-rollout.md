# Attorney Calendar Phase 8 — Controlled Rollout

Phase 8 adds a server-evaluated firm cohort, release telemetry, and a read-only rollback recommendation. Production activation requires explicit approval; the migration seeds production disabled at 0%.

Production-mode Vite builds resolve to the disabled production policy by default. Preview or staging builds must deliberately expose `VITE_VERCEL_ENV=preview` or `VITE_APP_ENV=staging`; absent that explicit value, they fail closed as production.

## Release ladder

1. Keep production at **0%** while the Phase 1–8 deterministic and staging gates run.
2. Add named internal firms to the allowlist before moving to **5%**.
3. Hold at **5%** for one business day and inspect the 24-hour health report.
4. Move to **25%**, then **50%**, only when the report has `rollbackRecommended: false` and support has no unresolved severity-1 or severity-2 incident.
5. Move to **100%** only after external calendar-client acceptance is complete and each previous cohort has met its observation window.

The database hashes the organisation ID into a stable 0–99 bucket. Named allowlisted firms remain eligible independently of the percentage. Existing appointments, RSVP, rescheduling, and other scheduling actions remain available when Create Invite is paused.

## Certification

Run the deterministic gate:

```sh
npm run test:attorney-calendar-invite
```

Run the staging certification with the established staging environment files:

```sh
npm run certify:attorney-calendar:staging
```

Read the latest staging health without changing configuration:

```sh
npm run report:attorney-calendar-rollout
```

Production health is also read-only and must be requested explicitly:

```sh
npm run report:attorney-calendar-rollout -- --production
```

## Health thresholds

The 24-hour decision requires at least 20 attempts/creations before a rate can recommend rollback. Rollback is recommended when any threshold is met or exceeded:

- Appointment or participant persistence failures: 5% of invite attempts.
- Delivery failures: 10% of created invites.
- Reminder scheduling failures: 10% of created invites.

The report exits with status 2 when rollback is recommended, making it suitable for a release gate without allowing the diagnostic command to mutate production.

## Rollback

When `rollbackRecommended` is true, stop cohort expansion immediately. An authorised operator should disable the production row and set its percentage to 0 in one reviewed database change, then verify that Create Invite is disabled while existing scheduling functionality remains intact. Preserve rollout events for incident analysis; do not delete production evidence.

After mitigation, rerun the deterministic suite, staging certification, and a full observation window before requesting fresh production activation approval.
