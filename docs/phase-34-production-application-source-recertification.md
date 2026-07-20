# Phase 34 — Recertify the Production Application Source

## Outcome

**Status: PRODUCTION_APPLICATION_SOURCE_RECERTIFIED**

The production aliases now serve the previously certified application commit `333c08eb420742a95330b07483d3c373f4978d6a`. The release branch resolves to the same runtime tree, and a fresh Node 22 build from that commit is reproducible.

## Drift found and corrected

Two independent drifts were found during certification:

1. Production promotion actions had targeted excluded commits `ae472638` and `21c15837`. Phase 34 restored existing certified deployment `dpl_GMPqoX7FK5phT4XRko6ZSHtWhwdT` to all production aliases after each detected drift.
2. Commit `21c15837` changed a settings page after the Phase 33 scope lock. Revert commit `94cf6383` preserves that work in Git history while restoring the locked runtime tree on the release branch.

Neither correction changed the production database, migration ledger, environment configuration, or dependency lockfile.

## Certification results

| Check | Result |
| --- | --- |
| Production release ID | `333c08eb420742a95330b07483d3c373f4978d6a` |
| Production deployment | `dpl_GMPqoX7FK5phT4XRko6ZSHtWhwdT` — READY |
| Isolated build | Node 22.23.1; 3,490 modules; passed |
| Reproducible output | 444 deterministic files plus timestamped manifest |
| Performance budget | Passed |
| Critical production assets | 427/427 healthy |
| Browser smoke | `/auth` HTTP 200; sign-in controls present; no console or page errors |
| Auth API guard | HTTP 401 without a session |
| Runtime error scan | Zero error-level entries and zero HTTP 500 entries in the bounded scan |

The machine-readable evidence is in `deployment-evidence/2026-07-20-phase34/production-source-recertification.json`. The Phase 20 and Phase 26 gates now consume this current certification instead of treating their historical deployment snapshots as the current release.

## Remaining operational control

The Vercel project correctly names `main` as its production branch, so release-branch pushes are expected to create previews. Explicit production promotion authority still needs tight operator control: a promoted out-of-scope preview can replace the certified artifact even while the PR scope gate remains green.

The unchanged lockfile also retains 13 dependency audit findings (2 low, 4 moderate, 7 high); remediation remains a separate reviewed security phase.
