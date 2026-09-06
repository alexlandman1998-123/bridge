// Canonical public entry point for dashboard/reporting reads.
// The implementation remains in its established modules during the first
// extraction pass so existing source-based evidence continues to work.
export { fetchDashboardOverview } from '../../lib/api/dashboardOverviewApi.js'
export {
  enrichDashboardSummaryRows,
  fetchTransactionsByParticipantSummary,
  fetchTransactionsListSummary,
} from '../../lib/api/dashboardTransactionSummaryApi.js'
