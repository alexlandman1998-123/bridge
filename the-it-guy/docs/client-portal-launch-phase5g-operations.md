# Client portal launch — Phase 5G operations and rollback

## Outcome

Phase 5G provides a fail-closed operational-readiness gate for the one-agency pilot. A technically healthy build cannot launch without accountable owners, working monitoring, a support runbook, tested alerts, and a successful rollback rehearsal.

## Current baseline

Vercel Runtime Logs and the privacy-safe client-portal launch metrics are available. No external Vercel observability integration was returned by the project inspection, so external error forwarding must not be assumed. Record the approved monitoring dashboard and alert path explicitly.

## Required certification

1. Assign monitoring, support, rollback, product, and daily-review owners.
2. Confirm coverage for route crashes, function errors, buyer/seller useful-content breaches, CLS, primary-task failures, and confirmed data exposure.
3. Trigger a non-production alert and record successful delivery.
4. Publish support and escalation channels with a 15-minute critical and 60-minute high-severity acknowledgement target.
5. Rehearse rollback in Preview using explicit deployment IDs; do not rehearse against Production.
6. Record recovery time, tester, timestamp, dashboard, runbook, and immutable evidence URLs.

The rollout remains limited to one agency, never expands automatically, and requires 72 hours of observation.

## Commands

```bash
npm run test:client-portal-launch-phase5g
npm run report:client-portal-launch-phase5g
npm run gate:client-portal-launch-phase5g
```

The enforced command returns non-zero until ownership, monitoring, support, alert delivery, and rollback rehearsal evidence are complete. Only then may Phase 5's operations evidence be marked `passed`.
