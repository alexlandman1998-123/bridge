# Attorney release readiness — Phase 6 stabilisation

## Objective

Observe the Phase 5-remediated staging system under real attorney use and fail closed on stale, incomplete, or unsafe evidence. Phase 6 is read-only against Supabase and does not deploy, reconcile, or change production data.

## Automated evidence

`observe:attorney-release-phase6:staging` binds the observation to the fingerprinted Phase 5 batch ledger and reads canonical transaction command receipts for transfer, bond, and cancellation attorneys. It calculates:

- elapsed observation time;
- action volume per attorney role;
- projected-action success rate;
- command projection p95 latency;
- live propagation gap count.

The observation and rollback artifacts are fingerprinted, owner-readable files. The checker rejects altered artifacts and evidence older than 15 minutes.

## Decision states

- `BLOCKED`: required evidence is missing, stale, altered, or points at another Phase 5 ledger.
- `ROLLBACK`: a security, visibility, integrity, permission, or live propagation regression is present.
- `HOLD`: safety checks pass, but the observation window or sample thresholds are incomplete.
- `STABILIZED`: every threshold passes for the same Phase 5 fingerprint.

Rollback takes precedence over all other states.

## Stabilisation thresholds

- One to three pilot attorney organisations.
- At least 72 hours of observation.
- At least 30 total attorney actions and five actions per attorney role.
- At least 99% successful action projection.
- Propagation p95 at or below 120 seconds, with zero current gaps.
- Zero security incidents, visibility breaches, data-integrity failures, unexpected permission allows, and unresolved critical incidents.

## Runbook

Start the observation once, naming the accountable owner and request/reference:

```bash
npm run observe:attorney-release-phase6:staging -- --owner='<owner>' --approval-reference='<reference>'
```

Refresh evidence and evaluate throughout the pilot:

```bash
npm run observe:attorney-release-phase6:staging
npm run check:attorney-release-phase6:staging
```

The checker is expected to return a non-zero exit code for `HOLD`, `BLOCKED`, or `ROLLBACK`. Expand release scope only after `STABILIZED`.

## Initial staging result — 2026-09-05

The observation started against Phase 5 ledger fingerprint `d11eba8f5cf174c680ea1d4d23fb593a5fa493b3e3b8dd5c21cb73df28477513`.

- Environment and artifact integrity: passed.
- Live propagation health: healthy, zero gaps.
- Decision: `HOLD`.
- Remaining conditions: complete 72 hours, at least 30 actions overall, and at least five actions from each attorney role.

This is a truthful observation hold, not a release failure and not a fabricated stabilisation result.
