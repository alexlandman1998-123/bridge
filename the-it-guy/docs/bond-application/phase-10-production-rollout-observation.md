# Phase 10: Controlled production rollout and observation

Phase 10 extends the locked Phase 0-9 assurance track into production operations. It does not deploy, expand or roll back production automatically. It certifies whether a manually promoted canary cohort is healthy enough for a human-approved next cohort.

## Release boundary

- Production must run the exact commit and artifact fingerprinted by a ready Phase 9 certification.
- Rollout uses a named feature flag, cohort and percentage with an immediately available pause path.
- Automatic expansion is forbidden.
- Each expansion requires a fresh Phase 10 observation artifact.

## Observation gate

The initial gate requires at least 60 minutes of production observation, at least one real application, a passing synthetic journey and aggregate telemetry evidence. It blocks on workflow failures, API errors, pack or handoff failures, duplicate active requirements, uploaded-document loss, critical incidents, unresolved incidents, missing alerts, incomplete ownership or an untested rollback path.

Evidence must contain aggregate counts/rates and opaque report references only. Do not place applicant names, identity numbers, contact details, document paths or application answers in the certification artifact.

## Commands

Generate the operator template:

```bash
npm run certify:bond-originator-production-rollout-phase10 -- \
  --template --artifact-id production-candidate-1 \
  --output artifacts/bond-phase10-evidence.json
```

Certify a completed observation file:

```bash
npm run certify:bond-originator-production-rollout-phase10 -- \
  --evidence artifacts/bond-phase10-evidence.json \
  --output artifacts/bond-phase10-certification.json
```

The certification command exits non-zero when rollout expansion is blocked.

## Verification

```bash
npm run test:bond-originator-production-rollout-phase10
```
