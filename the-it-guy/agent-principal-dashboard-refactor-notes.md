# Agent Principal Dashboard Refactor Notes

## Files Changed
- `src/pages/Dashboard.jsx`
- `src/pages/agency/AgencyAnalyticsPage.jsx`
- `src/lib/roles.js`
- `src/App.jsx`

## Branch Aggregation Approach
- Principal dashboard (`role=agent` + principal view mode) now loads transaction rows via `fetchTransactionsListSummary(...)` instead of participant-only filtering.
- This uses Supabase/RLS visibility and returns organisation-visible transactions, including all branch-assigned transactions the principal can access.
- Aggregation in principal analytics is computed from `roleScopedRows` (transactions), `appointmentSummary.rows` (viewings/appointments), `principalCrmSnapshot.leads` (lead pipeline snapshot), and `agentSharedData.listings` (listing snapshot).
- Current platform limitation: multi-organisation principal aggregation is not yet implemented in one view; scope is organisation-wide across accessible branches in the active organisation context.

## Metric Source Mapping
| Metric | Source | Scope/Filter | Type | Fallback |
|---|---|---|---|---|
| Pipeline Value | `roleScopedRows` transaction values (`purchase_price/sales_price/unit.price`) | All principal-visible rows, non-`REG` | Derived | `0` |
| Opportunities | `roleScopedRows` active count | All principal-visible rows, non-`REG` | Real/Derived | `0` |
| Negotiating | Stage classifier on `roleScopedRows` | Stage text/main-stage mapped to `negotiation` | Derived | `0` |
| Under Offer | Stage classifier on `roleScopedRows` | Stage text/main-stage mapped to `under_offer` | Derived | `0` |
| Average Deal Value | Pipeline value / opportunities | Principal scope | Derived | `0` |
| Active Transactions | `roleScopedRows` active count | non-`REG` | Real/Derived | `0` |
| Docs | `documentSummary.missingCount > 0` | Active transactions | Derived | `0` |
| Signing | Main stage `FIN`/`ATTY` | Active transactions | Derived | `0` |
| Transfer | Main stage `XFER` | Active transactions | Derived | `0` |
| Closed | Main stage `REG` | Principal transaction rows | Derived | `0` |
| Avg. Days to Transfer | `created_at/updated_at` to `registered_at/completed_at/updated_at` | `REG` or `XFER` rows | Derived | `0 days` |
| New Leads This Week | `principalCrmSnapshot.leads` by weekly range | Current week | Real/Derived | `0` |
| Contacted | `principalCrmSnapshot.leads` stage/status includes contact/follow-up | Principal scope | Derived | `0` |
| Viewings | `appointmentSummary.rows` filtered by viewing type and non-cancelled statuses | Principal scope | Real/Derived | `0` |
| Qualified | `principalCrmSnapshot.leads` stage includes qualify/viewing/offer/deal | Principal scope | Derived | `0` |
| Conversion Rate (Leads → Viewings) | `scheduledViewingsThisWeek / leadsThisWeek` | Current week | Derived | `0%` + explanatory message |
| Performance Overview cards | Listings/leads/appointments/transactions snapshots with selected date range | Principal scope + time filter | Real/Derived | `0` deltas/values |
| Recent Activity | Merged stream from leads + appointments + transactions + listings | Principal scope | Derived | Empty state card |

## Layout / UX Changes
- Refined top principal analytics into equal-height 3-column cards (`Pipeline Health`, `Transaction Activity`, `Lead Generation`).
- Standardized labels:
  - `Negotiating`
  - `Docs`
  - `Signing`
  - `Transfer`
  - `Closed`
- Aligned bottom insight rows across the 3 cards:
  - `Average Deal Value`
  - `Avg. Days to Transfer`
  - `Conversion Rate (Leads → Viewings)`
- Added lead-viewing fallback note when appointments/viewings are unavailable.
- Performance Overview header cleanup:
  - Removed `Organisation scope` pill.
  - Removed `Last 30 Days` filter.
  - Kept `This Week`, `Last 7 Days`, `This Month`.
  - Kept selectors on one horizontal row with overflow-safe behavior.

## Sections Moved
- Moved principal-facing deep `Performance Analytics` experience off the principal dashboard and surfaced it via new page:
  - Route: `/agency/analytics`
  - Navigation: `Agency -> Analytics`
- Added `Open Analytics` action from principal `Performance Overview` header.
- Kept `Agency Activity Heatmap` in principal dashboard.

## New Route / Navigation
- Added page: `src/pages/agency/AgencyAnalyticsPage.jsx`
- Added route: `/agency/analytics` in `App.jsx`
- Added sidebar child under `Agency`: `Analytics`

## Known Missing / Partial Data Sources
- Multi-organisation principal roll-up is not yet implemented in a single view; current aggregation is organisation-wide (active organisation context) across accessible branches.
- Viewings conversion quality depends on appointment capture quality (`appointment_type/status/date` consistency).
- Some KPI/trend blocks still rely on derived stage heuristics where dedicated offer/viewing stage models are incomplete.

## Build Result
- `npm run build` passed.
- Existing global warning persists from CSS minification (`Expected identifier but found "-"`) and pre-existing chunk-size warnings; no new build blocker introduced.

## Targeted Lint Result
- `npx eslint src/pages/agency/AgencyAnalyticsPage.jsx src/App.jsx src/lib/roles.js` passed.
- `npx eslint src/pages/Dashboard.jsx` reports pre-existing `no-unused-vars` and one hook dependency warning in legacy dashboard code paths.
- No new lint failure introduced by the Agency Analytics route/page additions.

## Remaining Issues
- Optional follow-up: clean historic `Dashboard.jsx` lint debt in a dedicated non-functional cleanup pass.
- Optional follow-up: true multi-organisation principal roll-up service if principal accounts can span multiple organisations in production.
