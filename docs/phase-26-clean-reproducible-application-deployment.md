# Phase 26 — Clean, Reproducible Application Deployment

## Status

**Release candidate certified; production deployment pending.**

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

## Dependency advisory

The unchanged lockfile currently reports 13 audit findings: 2 low, 4 moderate, and 7 high. Phase 26 does not run an automatic dependency rewrite because that would change the certified source and can introduce breaking upgrades. Dependency remediation must be reviewed as a separate application-security phase.

## Safety boundary

Phase 26 does not include concurrent working-tree changes, change database state, weaken the Phase 0 migration freeze, or deploy before the committed release candidate passes. Production evidence and the exact rollback target will be added after the Git-bound Vercel deployment is observed.
