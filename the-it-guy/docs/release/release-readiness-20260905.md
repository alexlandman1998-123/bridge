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
