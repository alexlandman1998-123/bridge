import assert from 'node:assert/strict'
import {
  evaluateAgentProductionDeployment,
  extractJavaScriptAssets,
} from './validate-agent-production-phase5.mjs'

const assets = [
  'assets/index-good.js',
  'assets/HeaderBar-good.js',
  'assets/Clients-good.js',
  'assets/AgentListings-good.js',
  'assets/PipelineCanvassingPage-good.js',
  'assets/AgencyPipelinePage-good.js',
  'assets/AttorneyTransactionDetail-good.js',
]

assert.deepEqual(
  extractJavaScriptAssets('<script src="/assets/index-good.js"></script> assets/index-good.js'),
  ['assets/index-good.js'],
)

const passing = evaluateAgentProductionDeployment({
  assets,
  sources: {
    entry: 'production entry',
    header: 'Recent notifications',
    clients: 'agent_clients.route.core_ready data-performance-settled',
    listings: 'coreFieldsOnly',
    canvassing: 'coreFieldsOnly',
    leadDetail: 'routeCoreOnly',
    transactionDetail: 'fetchTransactionRouteCoreById',
  },
})
assert.equal(passing.status, 'PASS')
assert.equal(passing.failedChecks.length, 0)

const stale = evaluateAgentProductionDeployment({
  assets: [...assets, 'assets/AgentReportingPage-stale.js'],
  sources: {
    entry: 'CommandPalette',
    header: 'Search transactions, clients, listings... View all notifications',
    clients: '',
    listings: '',
    canvassing: '',
    leadDetail: '',
    transactionDetail: 'fetchTransactionCoreById',
  },
})
assert.equal(stale.status, 'FAIL')
assert.deepEqual(
  stale.failedChecks.map((check) => check.id),
  [
    'broken_global_search_removed',
    'desktop_notification_dead_end_removed',
    'agent_reports_retired',
    'clients_performance_instrumented',
    'listings_core_first',
    'canvassing_core_first',
    'lead_detail_core_first',
    'transaction_detail_core_first',
    'command_palette_retired',
  ],
)

console.log('Phase 5 deployed-fixes validation checks passed.')
