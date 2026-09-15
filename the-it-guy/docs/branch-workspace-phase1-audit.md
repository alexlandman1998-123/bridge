# Branch Workspace Phase 1 Audit

Date: 2026-09-15

## Purpose

Freeze the current residential agency branch architecture before replacing the existing branch workspace shell. The next phases must reuse the platform's agent, listing, lead, and transaction workspaces; they must not introduce parallel record systems.

## Current Entry Points

- Branch directory: `/agency/branches`, rendered by `src/pages/agency/AgencyBranchesPage.jsx`.
- Existing branch workspace: `/agency/branches/:branchId`, rendered by `src/pages/agency/AgencyBranchWorkspacePage.jsx`.
- Existing agent profile: `/agency/agents/:agentId`.
- Existing listings workspace: `/listings/:listingSection?`.
- Existing transactions workspace: `/transactions` and `/transactions/:transactionId`.
- Existing agency lead list and lead workspace components live under `src/pages/agency/`; their route ownership must be reused when the branch Leads tab is wired.

The directory's row and View action already navigate to the existing dynamic branch route. The new card view does the same. Filters are currently component state, so return-state preservation is not yet implemented.

## Existing Workspace Assessment

`AgencyBranchWorkspacePage.jsx` is an earlier branch workspace implementation, not a suitable foundation to extend unchanged.

- It loads a branch, listings, transactions, agent leaderboard, invites, settings, and commission structures.
- It has local-state tabs: Overview, Agents, Listings, Transactions, Clients, Reporting, Documents, and Settings.
- It has no URL-addressable tab routes, breadcrumb trail, period URL state, branch switcher, Leads tab, Performance tab, or Compliance tab.
- It includes browser-derived values such as `pipelineValue * 0.03` for revenue. This must not be carried into the new dashboard because projected commission requires stored commission data or a configured commission rate.
- Its Overview uses a progress bar and summary tables, rather than the requested period-aware trend chart, funnel, attention queue, and recent activity model.

Phase 2 should replace the workspace shell and route model while retaining the existing route as the entry-point identity. It should not duplicate its operational data views.

## Current Data Relationships

| Domain | Current source | Branch attribution | Phase 2+ use |
| --- | --- | --- | --- |
| Branch | `organisation_branches` | Primary record ID | Header, switcher, settings |
| Staff | `organisation_users` | `branch_id`, `primary_branch_id`, `branch_scope` | Staff tab and manager lookup |
| Listings | `private_listings` | `branch_id` | Listings tab and active-listing metrics |
| Leads | `leads` / CRM read models | `branch_id` where present | Leads tab, attention queue, funnel |
| Transactions | `transactions` | `assigned_branch_id` | Transactions tab, pipeline and commission metrics |
| Agent performance | `branchAnalyticsService` | Branch ID input | Staff preview and Performance tab |

The branch foundation migration introduced indexes for staff, listings, leads, and transaction branch fields. New work must retain explicit branch attribution. It must never reconstruct historical branch ownership solely from the currently assigned agent.

## Current Query Flow And Required Correction

`getBranches()` in `agencyBranchService` currently loads all organisation branches, users, transactions, listings, and leads, then shapes every branch in the browser. `getBranch(branchId)` calls that method and selects one branch from its result.

This is acceptable for the current directory but is not the target query model for the branch workspace: it over-fetches organisation records, repeats requests, and makes it easy for metric definitions to diverge between screens.

The Phase 3 implementation must introduce a central branch analytics/read layer with these bounded read contracts:

```text
getBranchOverview(branchId, dateRange)
getBranchStaff(branchId, filters)
getBranchListingMetrics(branchId, dateRange)
getBranchLeadMetrics(branchId, dateRange)
getBranchTransactionMetrics(branchId, dateRange)
getBranchPerformance(branchId, dateRange)
getBranchAttentionItems(branchId)
getBranchRecentActivity(branchId, limit)
```

Each contract must enforce the branch scope in the query, paginate collection results, and return comparison-period data where applicable.

## Canonical Metric Decisions

| Metric | Definition for the new workspace | Current state |
| --- | --- | --- |
| Active agents | Active branch memberships with an agent role | Available through branch membership/headcount shaping |
| Active listings | Listings whose canonical status is not withdrawn, sold, archived, cancelled, completed, or inactive | Existing helper; status compatibility requires a backend-owned definition |
| Active leads | Open, non-archived leads in the selected branch | Needs a branch-scoped CRM query and canonical archive/stage mapping |
| Active transactions | Transactions without `registered_at` and not in registered, cancelled, archived, or completed lifecycle states | Existing helper; use this as the initial baseline |
| Transaction pipeline | Sum of purchase/sales price only for active transactions | Existing transaction value helper supports this; never mix listing asking prices into it |
| Projected commission | Stored gross/projected commission amount; otherwise a stored commission percentage applied to the transaction value | Existing directory service follows this rule; workspace's 3% fallback must be removed |
| Registered commission | Stored commission for registered transactions in the selected period | Requires a period-aware transaction query |

The final status vocabulary must be exposed from a shared backend/read-model adapter, rather than inferred from frontend display labels.

## Security And Scope Findings

- `organisation_branches` has RLS enabled and is organisation-member scoped in the original foundation migration.
- `organisation_users`, `private_listings`, `leads`, and `transactions` have branch identifier columns and branch-related indexes.
- `agencyBranchService` applies an application-level branch filter: open agency operations can access all branches, while other contexts receive only the membership branch.
- This application filtering is not sufficient by itself for the requested URL-isolation guarantee. The new query layer must rely on the relevant database RLS policies as well as the application guard.
- The current scope regression test expects a branch manager to read records in their assigned branch, but it currently fails at that assertion. This is a real policy-model mismatch against the requested branch-manager behaviour and must be resolved before Phase 2 access assertions are considered complete.

No schema or RLS change was applied in Phase 1.

## Reuse Map

| Requested surface | Existing system to reuse | Phase |
| --- | --- | --- |
| Staff and agent drill-down | `Agents.jsx` and `/agency/agents/:agentId` | 4 |
| Listings | Existing `/listings` workspace | 4 |
| Leads | Agency lead list/workspace under `src/pages/agency/` | 4 |
| Transactions | Existing `/transactions` workspace | 4 |
| Commission configuration | Existing commission settings/structures | 6 |
| Branch editing and invite flow | `agencyBranchService`, workspace invites, branch settings modal | 6 |

## Phase 2 Build Boundary

Phase 2 may implement only the following:

1. URL-addressable branch tab routes and a branch-context route guard.
2. Breadcrumb, branch header, and a separate full-width horizontal tab container matching the approved reference.
3. The requested tab names: Overview, Staff, Listings, Leads, Transactions, Performance, Compliance, and Settings.
4. Tab placeholders or redirects only where a reusable scoped operational screen has not yet been wired.
5. URL-preserved branch list return state.

Phase 2 must not fabricate KPI totals, derive commission at a fixed percentage, or add database tables/migrations.

## Verification Evidence

- `npm run test:agency-branch-metrics-phase3` passes.
- `npm run test:workspace-branch-scope` currently fails at the expected assigned-branch transaction read for a branch manager. The failure is documented above and is intentionally not masked or changed by this audit.

## Phase 1 Exit Status

The architecture, reuse boundaries, data sources, and metric rules are documented. One access-policy decision remains before the phase is fully closed: confirm and implement whether an assigned branch manager has branch-wide read access to the selected branch, as required by the approved workspace plan. The recommended answer is yes.
