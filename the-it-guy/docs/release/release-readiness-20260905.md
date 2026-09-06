# Release readiness review — 5 September 2026

## Decision

**No-go for functional Rental portal release.** The release candidate builds and its focused contracts pass, but Arch9 Staging lacks the Rental database foundation required for tenant and landlord portal workflows.

## Verified checks

| Check | Result | Evidence |
| --- | --- | --- |
| Production build | Pass | `npm run build` completed successfully (`4,145` modules transformed). |
| Rentals baseline | Pass | `npm run test:rentals-phase0`. |
| Document Trust contracts | Pass | Phase 0 and Phase 6.1 tests. |
| Bond portal contract | Pass | Phase 8 external-submission test. |
| Staging app shell | Pass | The designated Preview deployment returned `200` for a tenant portal route. |
| Portal API access guards | Pass | Tenant and landlord API endpoints returned `401` without an access token. |
| Token-backed Rental portal workflow | Blocked | Arch9 Staging has no Rental foundation tables or portal schema. |

## Build note

Vite emitted existing warnings about modules that are both dynamically and statically imported. The build completed successfully; these warnings do not block this release gate.

## Required release gate

Before any role-based tenant, landlord, or staff workflow can be approved, reconcile Arch9 Staging's migration history and introduce the Rental foundation as an approved managed baseline. Then apply and verify `20260905120250_rental_portal_foundation.sql`, issue non-production access tokens, and rerun the complete portal journey tests.

## Phase 6 main-sync integration verification — 6 September 2026

Phase 6 validates the reconciled commit stack locally without updating `main`,
changing a remote ref, or mutating Supabase. The branch merges cleanly with the
current `origin/main`; `git merge-tree --write-tree origin/main HEAD` produced
a synthetic integration tree without reporting a conflict.

| Gate | Result | Evidence |
| --- | --- | --- |
| Core service suite | Pass | `npm test`; all nine service/repository suites passed. |
| Rentals baseline | Pass | `npm run test:rentals-phase0`. |
| Document Trust | Pass | Phase 0 legacy-retirement and Phase 6 operational-assurance contracts. |
| Production build | Pass | Vite transformed 4,164 modules and completed the production build. |
| Repository lint errors | Pass after repair | `npx eslint . --quiet`; fixed all three error-level findings. The existing warning backlog remains outside this integration phase. |
| Listing workspace contract | Pass | `scripts/listing-workspace-ui-framework-phase2.test.mjs`. |
| Database-backed Rental acceptance | Blocked | The Phase 3 migration reconciliation hold and missing Arch9 Staging Rental foundation remain unchanged. |

The error-level lint repairs keep behavior stable: status icons are now rendered
through a statically declared React component, the onboarding demo organisation
ID uses the imported slug normalizer, and the disabled legacy development
marketing editor is controlled by a named feature constant rather than an
inline constant condition.

The non-authoritative `onboarding-branding-phase5` source snapshot remains stale
against the evolved settings save flow. It is not weakened or treated as a
main-sync blocker; it requires a separately scoped contract refresh if that
historical gate is to become authoritative again.

### Phase 6 decision

- **Ready for a local Git integration into `main`.** The reconciled commit stack
  has no merge conflict, core tests pass, the build passes, and there are no
  ESLint errors.
- **Not approved for database or functional Rental promotion.** No migration,
  staging deployment, production deployment, or remote branch update is
  authorised by this result.

## Phase 7 local-main integration — 6 September 2026

Local `main` was fast-forwarded from `2c0d8b4154bbd307965fdfd67964a04e3c347a42`
to the Phase 6 validated release tip
`0c78ea73462dbe091e68c4a6554de048b7a24f38`. The update applied 74 commits
without a merge commit or conflict. The source branch
`codex/release-validation-tooling` remains at the validated tip as a stable
reconciliation reference.

This phase updates only the local `main` ref and this closeout record. It does
not push `main`, delete or rewrite a branch, drop the Phase 0 recovery stash,
apply a migration, deploy an application, or alter a remote environment.

### Phase 7 decision

- Local `main` now contains the complete reconciled workspace and migration
  files from Phases 0–6.
- Remote `origin/main` remains unchanged and local `main` is intentionally ahead.
- The migration/staging hold remains in force; synchronising Git history does
  not authorise a database push or Rental production release.

## Phase 8 remote-main publication — 6 September 2026

Immediately before publication, `git fetch --prune origin` confirmed that
`origin/main` was unchanged at
`2c0d8b4154bbd307965fdfd67964a04e3c347a42`. It remained a strict ancestor of
local `main`, with zero remote-only commits, so the update qualifies for a
normal fast-forward push. Force push, history rewriting, and branch deletion
remain prohibited.

Phase 8 publishes the reconciled Git history to `origin/main` only after the
core service suite passes from the final local tree. It does not publish the
application, apply migrations, alter Supabase, remove recovery refs or stashes,
or approve the blocked Rental release.

### Phase 8 gate

- Refresh remote refs and require `origin/main` to be an ancestor of local
  `main`.
- Require a clean worktree and a passing core service suite.
- Push with the explicit refspec `main:main`, without force.
- Fetch the remote result and require local and remote `main` to resolve to the
  same commit before declaring Git publication complete.

## Phase 9 post-publication verification — 6 September 2026

GitHub resolved both local and remote `main` to the Phase 8 publication commit
`e4fb0bdf67d72269879e2137638aabcacdfdc109`. The workflows triggered for that
exact commit completed successfully:

| Workflow | Run | Result |
| --- | ---: | --- |
| Supabase Phase 0 Guard | `34042675569` | Pass |
| Supabase Phase 8 Closeout Gate | `34042675607` | Pass |
| MVP release certification | `34042675570` | Pass |

Recovery remains available after publication. The Phase 0 backup branch still
resolves to `f66c7539a87bbfc25a32cf71aa8b3bf90b0d4c9c`, the validated reconciliation
branch remains at `0c78ea73462dbe091e68c4a6554de048b7a24f38`, and the Phase 0 safety stash
remains at `1b615b1b47c2be62f8e5597138b906e219d22249`.

### Phase 9 decision

- Git publication and the repository's required post-push safety checks are
  complete.
- Recovery refs and stashes are retained; branch cleanup requires a separate,
  explicit destructive-action decision.
- The database migration hold remains active. This handoff does not apply SQL,
  deploy an application, or approve Rental production activation.
- The Phase 9 closeout commit must itself be fast-forwarded to `origin/main`
  and pass the same required GitHub checks before the reconciliation sequence
  is considered fully closed.
