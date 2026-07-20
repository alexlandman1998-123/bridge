# Phase 26 — Clean, Reproducible Application Deployment

## Status

**CLEAN_REPRODUCIBLE_APPLICATION_DEPLOYED**

The application release is intentionally based on committed source at `f387e49f`. Concurrent uncommitted application, email, legal-document editor, and partner-directory work is excluded from this release.

## Release contract

1. Build from a detached, clean Git worktree.
2. Install exactly from `the-it-guy/package-lock.json`.
3. Use Node 22, matching the application engine contract.
4. Run the guarded build, release-integrity checks, manifest verification, performance budget, and committed application tests.
5. Repeat the build and compare generated file hashes.
6. Push a deliberate `public/release-source.json` marker so Vercel creates a fresh Git-bound artifact rather than reusing the previous application build.
7. Verify the deployment is READY, the live release marker matches the release commit, all critical assets are healthy, browser smoke checks pass, and the production error scan is clean.
8. Preserve the prior READY deployment as the rollback target.

## Candidate evidence

| Check | Result |
| --- | --- |
| Isolated checkout | Passed |
| Fresh lockfile install | Passed |
| Runtime | Node 22.23.1 / npm 10.9.8 |
| Guarded build | Passed |
| Modules transformed | 3,490 |
| Critical assets | 428 |
| Performance budgets | Passed |
| Application tests | 9/9 passed |
| Repeat build | 444/444 stable generated-file hashes |
| Concurrent runtime changes | Excluded |

`release-manifest.json` is excluded from byte-for-byte comparison only because its `generatedAt` field is intentionally time-dependent. Its release ID and critical asset list remain verified.

## Production result

| Check | Result |
| --- | --- |
| Release commit | `2dabb3def53608519d5962c37f33a0a4a03f5680` |
| Preview | `dpl_9FpAikJWLAgTpuGqUfXG3Ep6NzLV` / READY |
| Production | `dpl_8wDQV2UxYamoqkxbto4jzAMgdpda` / READY |
| Production domain | `https://app.arch9.co.za` |
| Live release marker | Matches release commit |
| Production critical assets | 428/428 healthy |
| Browser smoke | `/auth` HTTP 200; sign-in controls present |
| Browser errors | 0 console / 0 page errors |
| Authenticated API guard | Expected HTTP 401 without credentials |
| Runtime error scan | 0 errors observed |

The previous production deployment `dpl_HoRcGD3XuPsu7tH8Eq9bEZbcHozY` remains the explicit rollback target.

## Dependency advisory

The unchanged lockfile currently reports 13 audit findings: 2 low, 4 moderate, and 7 high. Phase 26 does not run an automatic dependency rewrite because that would change the certified source and can introduce breaking upgrades. Dependency remediation must be reviewed as a separate application-security phase.

## Safety boundary

Phase 26 did not include concurrent working-tree changes, change database state, weaken the Phase 0 migration freeze, or change the dependency lockfile. The preview was verified before production promotion, and the production artifact was verified independently after Vercel applied the production environment.
