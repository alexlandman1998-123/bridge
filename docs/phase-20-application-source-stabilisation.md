# Phase 20 — Application Source Stabilisation

## Decision

**Status: APPLICATION_SOURCE_STABILISED**

The application currently serving production is reproducible from committed source. The former Phase 16 working-tree changes were captured in commit `785b7ef1`, that commit exists on `origin/codex/mvp-pilot-readiness`, and Vercel deployed it to production as `dpl_441tuc5PAD2vPGj6r2CCusmmPqnX`.

Phase 26 supersedes the live-source portion of this evidence. Production now serves clean release commit `2dabb3de` as Vercel deployment `dpl_8wDQV2UxYamoqkxbto4jzAMgdpda`; the Phase 20 test consumes that newer evidence while retaining this report as the historical stabilisation record.

## Evidence

| Check | Result |
| --- | --- |
| Live release ID | `785b7ef1365d1b7f8fefe4bb8865da3648607a6b` |
| Vercel target/status | production / READY |
| Runtime build inputs | clean and committed |
| Runtime input fingerprint | `ec63af749229266c665c9c1d19973a149317557bc71384b67579613b0517b473` |
| Runtime source tree | `e3b906f98e318326f41bb95b71d7f4c23470666d` |
| Guarded local build | passed; 3,490 modules |
| Release integrity | passed |
| Performance budgets | passed |
| Conditional-document contracts | 11/11 passed |
| Production critical assets | 428/428 healthy |

The production release marker is generated from Vercel's Git commit SHA. It matches the committed source exactly. The current HEAD has the same Git fingerprint for all runtime build inputs as that deployed commit.

Local and Vercel asset filenames are allowed to differ because production environment values participate in the bundle. Both manifests contain 428 critical assets, and the live verifier fetched every production asset successfully. Source identity is therefore enforced with the Git-bound release ID and committed build-input fingerprint.

## Guardrail

The Phase 20 gate fails if:

- a runtime build input has an uncommitted change;
- the deployed source commit is no longer an ancestor of the release branch;
- the current runtime fingerprint differs from the production source fingerprint;
- the source tree or recorded Vercel release ID differs;
- production asset or guarded-build evidence is incomplete.

## Safety boundary

Phase 20 inspected the existing Vercel deployment and rebuilt locally. It did not redeploy the application, alter Vercel configuration, mutate a database, or weaken the Phase 0 migration guard.

## Remaining closeout blockers

1. Promote and evidence the remaining 28 governed migrations.
2. Push the remaining release-governance commits through the normal review path.
3. Configure an explicit production document cohort instead of shadow mode.
