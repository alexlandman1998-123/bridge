# Attorney release readiness — Phase 9 canary assurance

## Objective

Observe an authorized Phase 8 production canary, decide whether to continue or roll back, and prevent wider release until real production evidence is clean. This gate is read-only: it does not deploy, mutate Supabase, expand a cohort, or execute rollback.

## Inputs

- An immutable, read-only Phase 8 execution receipt with status `CANARY_ACTIVE`.
- Fresh, fingerprinted production evidence for the exact deployment and Phase 8 plan.
- Runtime log error counts, client-safety review, propagation health, action reliability, and role coverage.

## Decision states

- `BLOCKED`: receipt or observation evidence is missing, stale, altered, or mismatched.
- `ROLLBACK`: verified production evidence shows a security, visibility, integrity, permission, runtime, client-safety, or propagation failure.
- `OBSERVE`: the canary is healthy but has not met the time or action thresholds.
- `VERIFIED`: the canary has met every threshold without a stop condition.

Verified rollback signals take precedence over incomplete evidence. Missing evidence alone is never described as a production incident.

## Thresholds

- At least 24 hours in production.
- At least 15 successful canary attorney actions.
- At least three actions from each of transfer, bond, and cancellation attorneys.
- At least 99% projected-action success.
- Propagation p95 no greater than 120 seconds and zero current gaps.
- Zero runtime errors, unsafe client projections, security incidents, visibility breaches, integrity failures, unexpected permission allows, and unresolved critical incidents.
- Evidence refreshed within 15 minutes.

## Runbook

Generate production evidence from the approved monitoring sources, fingerprint all fields preceding `evidenceFingerprint`, then run:

```bash
npm run check:attorney-release-phase9 -- \
  --phase8-receipt=output/attorney-release/phase8-execution-receipt.json \
  --observation=output/attorney-release/phase9-production-observation.json
```

Treat `ROLLBACK` as an immediate human-operated rollback instruction using the deployment recorded in Phase 8. Treat `BLOCKED` as a monitoring/evidence failure and `OBSERVE` as a healthy but incomplete canary.

After the gate reaches `VERIFIED`, emit the immutable receipt required by Phase 10:

```bash
npm run check:attorney-release-phase9 -- \
  --phase8-receipt=output/attorney-release/phase8-execution-receipt.json \
  --observation=output/attorney-release/phase9-production-observation.json \
  --emit-receipt \
  --receipt=output/attorney-release/phase9-verified.json
```

Receipt creation fails for every state other than `VERIFIED` and never overwrites an existing receipt.

## Current result — 2026-09-05

Phase 9 is implemented and its cumulative contract suite passes. It currently returns `BLOCKED` because Phase 8 has not executed and therefore no production canary receipt or observation exists. Production remains untouched.
