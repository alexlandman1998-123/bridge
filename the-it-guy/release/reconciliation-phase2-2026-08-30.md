# Phase 2 reconciliation manifest — 30 August 2026

## Compared sources

| Source | Revision / state | Decision |
| --- | --- | --- |
| Production baseline | `release/production-stabilization-20260830` at `00f78465` | Release source of truth |
| `main` | `acb81f66` | Do not merge: it is an older, divergent line, not a forward change-set |
| Current working tree | Uncommitted changes | Preserve and review as independent change-sets |

`main` has no commits that are absent from the release baseline. Conversely, the
release baseline contains a substantial, unrelated client-portal/rentals line
that is not on `main`. A blanket merge in either direction would therefore risk
removing production capability or mixing unrelated work into the stability
release.

## Uncommitted work inventory

| Group | Files | Classification | Release decision |
| --- | --- | --- | --- |
| Organisation branding cache | `src/context/OrganisationContext.jsx`, `src/context/organisationBrandingCache.js`, `src/context/__tests__/organisationBrandingCache.test.js` | UI/performance | Hold for a separately tested branding change-set |
| Attorney dashboard snapshot | `src/pages/AttorneyDashboardPage.jsx`, `src/services/attorneyDashboard.js`, `src/services/transactionAttorneyAssignments.js`, `scripts/attorney-dashboard-control-centre.test.mjs`, `supabase/migrations/20260830125035_attorney_dashboard_rpc_hot_path.sql` | Performance plus database migration | Hold until the migration and application fallback are reviewed together |
| Agency lead/seller changes | `src/pages/agency/AgencyPipelinePage.jsx`, `src/services/agentLeadWorkspaceService.js`, `scripts/seller-profile-onboarding-hydration.test.mjs` | Feature/workflow | Hold for the seller-onboarding release group |

## Inclusion rules for this release

1. Only changes that address the confirmed navigation/auth/blank-state issue
   may enter the first stability candidate.
2. A database migration must always be released with its matching application
   code and a rollback/compatibility plan; it cannot be cherry-picked alone.
3. Feature and visual changes remain out of the stability candidate until the
   release candidate has passed Preview acceptance.
4. Each accepted group is applied as a dedicated commit to
   `release/production-stabilization-20260830`, built, and tested before the
   next group is considered.

## Phase 2 result

No application changes were merged into the release candidate. This is
intentional: there is no reviewed, forward-only change-set eligible for a safe
merge yet. The next approved work is Phase 3's focused auth and route-stability
correction on the release branch.
