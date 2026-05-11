# Agent Module — Principal View Transactions Refactor Notes

## Files changed
- `src/pages/Units.jsx`
- `src/components/AgentTransactionsTable.jsx`
- `src/lib/api.js`
- `src/lib/organisationAccess.js`

## Scope and permission behavior
- Kept page naming as **Transactions** (removed role-confusing “My Transactions” usage in this flow).
- Added principal-context detection for agent app role using organisation context (`fetchOrganisationSettings`) + membership normalization.
- Principal/owner-style agent users now load org-wide transactions via `fetchTransactionsListSummary`.
- Standard agents remain participant-scoped via `fetchTransactionsByParticipantSummary`.
- Added `branch_manager` into admin/principal experience role set in `organisationAccess` to support branch-level oversight behavior.

## Principal table and layout refactor
- Replaced the previous transaction table UI with a denser operational table in `AgentTransactionsTable`.
- New columns:
  - Transaction Reference
  - Buyer / Client
  - Property / Unit
  - Development / Listing
  - Assigned Agent
  - Main Stage
  - Finance Stage
  - Transfer Stage
  - Status
  - Last Updated
  - Actions
- Added min-width controls, truncation with hover title, row striping, hover/click behavior, sticky headers, and improved chip-style stage/status display.
- Added pagination controls and visible count context for larger result sets.
- Added improved principal vs agent empty-state guidance copy.

## Principal filtering improvements
- Added principal-oriented filters in `Units.jsx`:
  - Organisation
  - Branch
  - Assigned Agent
  - Status
  - Date Window
- Added URL-state hydration support for new principal filter keys.
- Applied principal filter matching directly in row filtering logic (including search and non-search paths).
- Hid agent-only filters (transaction type/readiness/missing docs) during principal-agent view to reduce clutter.

## API/select shape support
- Expanded transaction summary selection in `src/lib/api.js` for table/filter support:
  - `organisation_id`
  - `assigned_branch_id`
  - `lifecycle_state`
- Added missing-column fallback registration for the newly selected fields.

## Data/label notes
- Organisation/branch labels currently fallback to IDs where display names are unavailable in the current summary payload.
- Stage/status chips are derived from available transaction fields and safe fallbacks.

## Build result
- `npm run build`: **PASS**
- Build includes pre-existing project warnings (large chunk size and a CSS syntax warning outside this refactor scope).

## Targeted lint result
- Command: `npx eslint src/pages/Units.jsx src/components/AgentTransactionsTable.jsx src/lib/api.js src/lib/organisationAccess.js`
- Result: **FAIL** due to pre-existing errors in `src/lib/api.js` unrelated to this transactions refactor:
  - undefined references (`deriveAttorneyOperationalStateForRow`, `resolvePurchaserTypeFromFormData`, `ensureOrganisationContext`)
  - unused symbols (`deriveStageFromSubprocesses`, `requestReservationDepositEmailIfPossible`)
  - one unused eslint-disable warning
- Refactor-local files (`Units.jsx`, `AgentTransactionsTable.jsx`, `organisationAccess.js`) were updated to remove newly introduced lint issues.

## Remaining risks / follow-ups
- Validate principal scope behavior against live membership/branch datasets for principals attached to multiple organisations.
- Consider enriching org/branch display labels in API responses for cleaner filter labels.
- Address legacy lint debt in `src/lib/api.js` to restore green targeted lint checks.
