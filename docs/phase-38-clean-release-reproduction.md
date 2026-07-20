# Phase 38 — Reproduce the Complete Release in a Clean Checkout

## Outcome

**Status: CLEAN_RELEASE_REPRODUCED_WITH_BLOCKERS**

The exact remote release commit `03107b17fe1e5c032cac6575348a6d3fdd81f37d` was checked out at detached HEAD in a new temporary Git worktree. The checkout was clean before execution and did not reuse either working tree's dependency folders.

Fresh lockfile installs completed under Node `v22.23.1`. The complete deterministic release matrix produced 28 passes and four failures. All 24 MVP release-certification checks, all nine application service-test groups, the guarded production build, the build release manifest, and the performance budget passed.

This proves that the committed source can be installed, tested, and built from scratch. It does **not** approve a production promotion.

## Remaining blockers

- Phase 20 expects an older application-source fingerprint.
- Phase 26 expects an older release-candidate fingerprint.
- Phase 33 detects eight document-generation runtime paths outside its locked allowlist.
- Phase 34 expects the production-source certification recorded before those runtime changes.
- Supabase Preview remains externally blocked because its branch does not have the custom SMTP secret required by `supabase/config.toml`.
- Dependency audits report 3 root vulnerabilities and 13 application vulnerabilities. These are recorded for review; Phase 38 does not silently rewrite either lockfile.

The four local failures are governance drift, not evidence of a missing database migration or an application build failure. The intended runtime changes must be explicitly accepted into the release scope, then Phases 20, 26, 33, and 34 must be regenerated in order. The Supabase Preview SMTP configuration must be repaired separately and rerun.

## Reproduction boundary

Phase 38 used only local, deterministic checks. It did not connect to staging or production, apply a migration, change an environment variable, deploy an application, or capture credentials. External Supabase and Vercel checks are deliberately outside this evidence boundary.

The machine-readable result is in `deployment-evidence/2026-07-20-phase38/clean-release-reproduction.json`. Run `npm run release:phase38:verify` to validate the evidence contract.
