import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const enforce = process.argv.includes('--enforce')
const json = process.argv.includes('--json')

const files = {
  dashboardPage: path.join(root, 'src/pages/Dashboard.jsx'),
  hydrationRollout: path.join(root, 'src/lib/dashboardHydrationRollout.js'),
  overviewApi: path.join(root, 'src/lib/api/dashboardOverviewApi.js'),
  transactionSummaryApi: path.join(root, 'src/lib/api/dashboardTransactionSummaryApi.js'),
  developerAggregateMigration: path.join(
    root,
    '../supabase/migrations/202607310004_dashboard_developer_aggregate_rpc.sql',
  ),
  developerRollupMigration: path.join(
    root,
    '../supabase/migrations/202607310005_dashboard_developer_metric_rollups.sql',
  ),
}

const source = Object.fromEntries(
  Object.entries(files).map(([key, filePath]) => [key, fs.readFileSync(filePath, 'utf8')]),
)

const surfaces = [
  surface({
    id: 'dashboard_page_initial_loader',
    file: 'src/pages/Dashboard.jsx',
    risk: 'entrypoint',
    evidence: [
      'fetchDashboardOverviewAggregate(overviewRequest)',
      'fetchDashboardOverview(overviewRequest)',
      'fetchTransactionsByParticipantSummary({',
      'fetchTransactionsListSummary({',
    ],
    detail: 'Dashboard initial load can enter the developer aggregate/detail overview, participant summary, or principal list summary paths.',
  }),
  surface({
    id: 'developer_overview_unit_hydration',
    file: 'src/lib/api/dashboardOverviewApi.js',
    risk: 'high',
    evidence: [
      'units = await fetchUnitsBase(client, developmentId)',
      'await hydrateUnitRows(client, units, { includeOperationalSignals })',
    ],
    detail: 'Developer overview fetches units first, then hydrates row objects for dashboard metrics.',
  }),
  surface({
    id: 'developer_overview_transactions_by_unit_ids',
    file: 'src/lib/api/dashboardOverviewApi.js',
    risk: 'high',
    evidence: [
      'async function fetchActiveTransactionsForUnitIds',
      ".in('unit_id', unitIds)",
    ],
    detail: 'Developer overview loads transactions for every scoped unit id.',
  }),
  surface({
    id: 'developer_overview_buyer_hydration',
    file: 'src/lib/api/dashboardOverviewApi.js',
    risk: 'medium',
    evidence: [
      "client\n      .from('buyers')",
      ".in('id', buyerIds)",
    ],
    detail: 'Developer overview loads buyer rows for hydrated transaction rows.',
  }),
  surface({
    id: 'developer_overview_handover_hydration',
    file: 'src/lib/api/dashboardOverviewApi.js',
    risk: 'medium',
    evidence: [
      ".from('transaction_handover')",
      ".in('transaction_id', transactionIds)",
    ],
    detail: 'Developer overview loads handover rows for every hydrated transaction id.',
  }),
  surface({
    id: 'developer_overview_issue_hydration',
    file: 'src/lib/api/dashboardOverviewApi.js',
    risk: 'high',
    evidence: [
      'queryClientIssues(client, { unitIds })',
      ".from('client_issues')",
    ],
    detail: 'Developer overview loads client issues for every scoped unit id.',
  }),
  surface({
    id: 'dashboard_commission_snapshot_hydration',
    file: 'src/lib/api/dashboardOverviewApi.js',
    risk: 'medium',
    evidence: [
      'hydrateRowsWithCommissionSnapshots',
      ".from('transaction_commissions')",
    ],
    detail: 'Dashboard row hydration can add commission snapshots by transaction id.',
  }),
  surface({
    id: 'participant_access_resolution',
    file: 'src/lib/api/dashboardTransactionSummaryApi.js',
    risk: 'medium',
    evidence: [
      'getAccessibleTransactionIdsForUser',
      'fetchTransactionSummaryRowsByIds',
    ],
    detail: 'Participant dashboards resolve accessible transaction ids before fetching row summaries.',
  }),
  surface({
    id: 'principal_transaction_list_query',
    file: 'src/lib/api/dashboardTransactionSummaryApi.js',
    risk: 'high',
    evidence: [
      'export async function fetchTransactionsListSummary',
      ".from('transactions')",
      'TRANSACTION_SUMMARY_SELECT_CLAUSE',
    ],
    detail: 'Principal list summary can load a broad transaction summary row set.',
  }),
  surface({
    id: 'transaction_summary_relation_hydration',
    file: 'src/lib/api/dashboardTransactionSummaryApi.js',
    risk: 'medium',
    evidence: [
      "client.from('buyers').select('id, name, phone, email').in('id', buyerIds)",
      "client.from('units').select('id, development_id, unit_number, phase, price, status').in('id', unitIds)",
      "client.from('developments').select('id, name, location').in('id', allDevelopmentIds)",
    ],
    detail: 'Transaction summary rows are hydrated with buyers, units, and developments.',
  }),
  surface({
    id: 'bond_intake_document_hydration',
    file: 'src/lib/api/dashboardTransactionSummaryApi.js',
    risk: 'high',
    evidence: [
      'async function enrichRowsWithBondIntakeContext',
      ".from('documents')",
      'loadTransactionDocumentRequestsByIds(client, transactionIds)',
    ],
    detail: 'Bond dashboard enrichment can load documents and document requests for every transaction id.',
  }),
  surface({
    id: 'bond_intake_role_player_hydration',
    file: 'src/lib/api/dashboardTransactionSummaryApi.js',
    risk: 'medium',
    evidence: [
      ".from('transaction_role_players')",
      ".in('transaction_id', transactionIds)",
    ],
    detail: 'Bond dashboard enrichment can load role players for every transaction id.',
  }),
]

const highRiskCount = surfaces.filter((item) => item.present && item.risk === 'high').length
const mediumRiskCount = surfaces.filter((item) => item.present && item.risk === 'medium').length
const presentCount = surfaces.filter((item) => item.present).length

const dynamicCounts = {
  dashboardLoaderEntrypointCount: countMatches(
    source.dashboardPage,
    /\bfetch(?:DashboardOverview|TransactionsByParticipantSummary|TransactionsListSummary)\s*\(/g,
  ),
  dashboardBodyLoadingGateCount: countMatches(source.dashboardPage, /!\s*loading\s*&&\s*isSupabaseConfigured/g),
  dashboardAggregateLoaderCount: countMatches(source.dashboardPage, /\bfetchDashboardOverviewAggregate\s*\(/g),
  dashboardLazyPanelHydrationCount: countMatches(source.dashboardPage, /\bhydrateDashboardOverviewPanels\s*\(/g),
  overviewTransactionIdInFilters: countMatches(source.overviewApi, /\.in\('transaction_id', transactionIds\)/g),
  overviewUnitIdInFilters: countMatches(source.overviewApi, /\.in\('unit_id', unitIds\)/g),
  transactionSummaryTransactionIdInFilters: countMatches(
    source.transactionSummaryApi,
    /\.in\('transaction_id', transactionIds\)/g,
  ),
  transactionSummaryIdBatchFilters: countMatches(source.transactionSummaryApi, /\.in\('id', ids\)/g),
}

const report = {
  enforce,
  contract: 'dashboard-hydration-phase6-v1',
  summary: {
    presentSurfaceCount: presentCount,
    highRiskSurfaceCount: highRiskCount,
    mediumRiskSurfaceCount: mediumRiskCount,
    shellFirst: {
      bodyGate: source.dashboardPage.includes('const shouldRenderDashboardBody = isSupabaseConfigured'),
      loadingStateGate: source.dashboardPage.includes(
        'const shouldShowDashboardLoadingState = loading && shouldRenderDashboardBody',
      ),
      bodyBlockedByLoading: dynamicCounts.dashboardBodyLoadingGateCount > 0,
    },
    supabaseAggregation: {
      migration: source.developerAggregateMigration.includes(
        'create or replace function public.bridge_dashboard_developer_overview_aggregate',
      ),
      clientRpc: source.overviewApi.includes("client.rpc('bridge_dashboard_developer_overview_aggregate'"),
      loaderFastPath: source.dashboardPage.includes('const aggregate = await fetchDashboardOverviewAggregate'),
    },
    lazyPanelHydration: {
      apiWrapper: source.overviewApi.includes('export async function hydrateDashboardOverviewPanels'),
      baseRowsSkipOperationalSignals: source.dashboardPage.includes('includeOperationalSignals: false') &&
        source.dashboardPage.includes('includeCommissionSnapshots: false'),
      panelWrapper: source.dashboardPage.includes('void hydrateDashboardOverviewPanels({'),
      staleLoadToken: source.dashboardPage.includes('dashboardPanelHydrationRef.current === panelHydrationLoadId'),
    },
    rollups: {
      table: source.developerRollupMigration.includes('create table if not exists public.dashboard_developer_metric_rollups'),
      refreshRpc: source.developerRollupMigration.includes(
        'create or replace function public.bridge_refresh_dashboard_developer_metric_rollups',
      ),
      aggregatePrefersRollups: source.developerRollupMigration.includes("aggregateSource', 'rollup'") &&
        source.developerRollupMigration.includes('v_rollup_count = v_scoped_development_count'),
      clientRefreshRpc: source.overviewApi.includes("client.rpc('bridge_refresh_dashboard_developer_metric_rollups'"),
      clientMetadata: source.overviewApi.includes('rollupGeneratedAt'),
    },
    rollout: {
      helper: source.hydrationRollout.includes('export function getDashboardHydrationRollout'),
      aggregateRoleFlag: source.hydrationRollout.includes('VITE_DASHBOARD_AGGREGATE_ROLLOUT_ROLES'),
      lazyPanelRoleFlag: source.hydrationRollout.includes('VITE_DASHBOARD_LAZY_PANEL_ROLLOUT_ROLES'),
      rollupRefreshFlag: source.hydrationRollout.includes('VITE_DASHBOARD_ROLLUP_REFRESH_ENABLED'),
      aggregateLoaderGate: source.dashboardPage.includes('dashboardHydrationRollout.aggregateEnabled'),
      lazyPanelLoaderGate: source.dashboardPage.includes('dashboardHydrationRollout.lazyPanelsEnabled'),
    },
    dynamicCounts,
  },
  budgets: {
    maxPresentSurfaces: 12,
    maxHighRiskSurfaces: 5,
    maxDashboardLoaderEntrypoints: 4,
    maxDashboardBodyLoadingGates: 0,
    minDashboardAggregateLoaderCalls: 1,
    minDashboardLazyPanelHydrationCalls: 1,
    maxOverviewTransactionIdInFilters: 2,
    maxOverviewUnitIdInFilters: 4,
    maxTransactionSummaryTransactionIdInFilters: 8,
    maxTransactionSummaryIdBatchFilters: 4,
    minRolloutGates: 2,
  },
  surfaces,
}

if (json) {
  console.log(JSON.stringify(report, null, 2))
} else {
  printReport(report)
}

if (enforce) {
  const failures = []
  if (presentCount > report.budgets.maxPresentSurfaces) {
    failures.push(`present hydration surfaces ${presentCount} exceeds ${report.budgets.maxPresentSurfaces}`)
  }
  if (highRiskCount > report.budgets.maxHighRiskSurfaces) {
    failures.push(`high-risk hydration surfaces ${highRiskCount} exceeds ${report.budgets.maxHighRiskSurfaces}`)
  }
  if (dynamicCounts.dashboardLoaderEntrypointCount > report.budgets.maxDashboardLoaderEntrypoints) {
    failures.push(
      `dashboard loader entrypoints ${dynamicCounts.dashboardLoaderEntrypointCount} exceeds ${report.budgets.maxDashboardLoaderEntrypoints}`,
    )
  }
  if (!report.summary.shellFirst.bodyGate) {
    failures.push('dashboard shell-first body gate is missing')
  }
  if (!report.summary.shellFirst.loadingStateGate) {
    failures.push('dashboard shell-first loading state gate is missing')
  }
  if (dynamicCounts.dashboardBodyLoadingGateCount > report.budgets.maxDashboardBodyLoadingGates) {
    failures.push(
      `dashboard body loading gates ${dynamicCounts.dashboardBodyLoadingGateCount} exceeds ${report.budgets.maxDashboardBodyLoadingGates}`,
    )
  }
  if (!report.summary.supabaseAggregation.migration) {
    failures.push('dashboard developer aggregate RPC migration is missing')
  }
  if (!report.summary.supabaseAggregation.clientRpc) {
    failures.push('dashboard aggregate RPC client is missing')
  }
  if (!report.summary.supabaseAggregation.loaderFastPath) {
    failures.push('dashboard aggregate loader fast path is missing')
  }
  if (dynamicCounts.dashboardAggregateLoaderCount < report.budgets.minDashboardAggregateLoaderCalls) {
    failures.push(
      `dashboard aggregate loader calls ${dynamicCounts.dashboardAggregateLoaderCount} is below ${report.budgets.minDashboardAggregateLoaderCalls}`,
    )
  }
  if (!report.summary.lazyPanelHydration.apiWrapper) {
    failures.push('dashboard lazy panel hydration API wrapper is missing')
  }
  if (!report.summary.lazyPanelHydration.baseRowsSkipOperationalSignals) {
    failures.push('dashboard base row load does not skip operational signals and commission snapshots')
  }
  if (!report.summary.lazyPanelHydration.panelWrapper) {
    failures.push('dashboard lazy panel hydrator is missing')
  }
  if (!report.summary.lazyPanelHydration.staleLoadToken) {
    failures.push('dashboard lazy panel stale-load token is missing')
  }
  if (dynamicCounts.dashboardLazyPanelHydrationCount < report.budgets.minDashboardLazyPanelHydrationCalls) {
    failures.push(
      `dashboard lazy panel hydration calls ${dynamicCounts.dashboardLazyPanelHydrationCount} is below ${report.budgets.minDashboardLazyPanelHydrationCalls}`,
    )
  }
  if (!report.summary.rollups.table) {
    failures.push('dashboard developer metric rollup table is missing')
  }
  if (!report.summary.rollups.refreshRpc) {
    failures.push('dashboard developer metric rollup refresh RPC is missing')
  }
  if (!report.summary.rollups.aggregatePrefersRollups) {
    failures.push('dashboard aggregate RPC does not prefer stored rollups')
  }
  if (!report.summary.rollups.clientRefreshRpc) {
    failures.push('dashboard aggregate client refresh RPC is missing')
  }
  if (!report.summary.rollups.clientMetadata) {
    failures.push('dashboard aggregate client does not preserve rollup metadata')
  }
  if (!report.summary.rollout.helper) {
    failures.push('dashboard hydration rollout helper is missing')
  }
  if (!report.summary.rollout.aggregateRoleFlag) {
    failures.push('dashboard aggregate rollout role flag is missing')
  }
  if (!report.summary.rollout.lazyPanelRoleFlag) {
    failures.push('dashboard lazy panel rollout role flag is missing')
  }
  if (!report.summary.rollout.rollupRefreshFlag) {
    failures.push('dashboard rollup refresh rollout flag is missing')
  }
  const rolloutGateCount = Number(report.summary.rollout.aggregateLoaderGate) + Number(report.summary.rollout.lazyPanelLoaderGate)
  if (rolloutGateCount < report.budgets.minRolloutGates) {
    failures.push(`dashboard rollout gates ${rolloutGateCount} is below ${report.budgets.minRolloutGates}`)
  }
  if (dynamicCounts.overviewTransactionIdInFilters > report.budgets.maxOverviewTransactionIdInFilters) {
    failures.push(
      `overview transaction-id batch filters ${dynamicCounts.overviewTransactionIdInFilters} exceeds ${report.budgets.maxOverviewTransactionIdInFilters}`,
    )
  }
  if (dynamicCounts.overviewUnitIdInFilters > report.budgets.maxOverviewUnitIdInFilters) {
    failures.push(
      `overview unit-id batch filters ${dynamicCounts.overviewUnitIdInFilters} exceeds ${report.budgets.maxOverviewUnitIdInFilters}`,
    )
  }
  if (
    dynamicCounts.transactionSummaryTransactionIdInFilters >
    report.budgets.maxTransactionSummaryTransactionIdInFilters
  ) {
    failures.push(
      `transaction summary transaction-id batch filters ${dynamicCounts.transactionSummaryTransactionIdInFilters} exceeds ${report.budgets.maxTransactionSummaryTransactionIdInFilters}`,
    )
  }
  if (dynamicCounts.transactionSummaryIdBatchFilters > report.budgets.maxTransactionSummaryIdBatchFilters) {
    failures.push(
      `transaction summary id batch filters ${dynamicCounts.transactionSummaryIdBatchFilters} exceeds ${report.budgets.maxTransactionSummaryIdBatchFilters}`,
    )
  }

  if (failures.length) {
    throw new Error(`Dashboard hydration audit failed:\n- ${failures.join('\n- ')}`)
  }
}

function surface({ id, file, risk, evidence, detail }) {
  const fileKey = Object.entries(files).find(([, filePath]) => filePath.endsWith(file))?.[0]
  const fileSource = fileKey ? source[fileKey] : ''
  const missingEvidence = evidence.filter((needle) => !fileSource.includes(needle))
  return {
    id,
    file,
    risk,
    present: missingEvidence.length === 0,
    missingEvidence,
    detail,
  }
}

function countMatches(value, pattern) {
  return [...String(value || '').matchAll(pattern)].length
}

function printReport(value) {
  console.log('dashboard hydration audit')
  console.log(`  contract: ${value.contract}`)
  console.log(`  surfaces present: ${value.summary.presentSurfaceCount}/${value.surfaces.length}`)
  console.log(`  high-risk surfaces: ${value.summary.highRiskSurfaceCount}`)
  console.log(`  medium-risk surfaces: ${value.summary.mediumRiskSurfaceCount}`)
  console.log('  shell-first:')
  console.log(`    - body gate: ${value.summary.shellFirst.bodyGate ? 'present' : 'missing'}`)
  console.log(`    - loading state gate: ${value.summary.shellFirst.loadingStateGate ? 'present' : 'missing'}`)
  console.log(`    - body blocked by loading: ${value.summary.shellFirst.bodyBlockedByLoading ? 'yes' : 'no'}`)
  console.log('  supabase aggregation:')
  console.log(`    - migration: ${value.summary.supabaseAggregation.migration ? 'present' : 'missing'}`)
  console.log(`    - client RPC: ${value.summary.supabaseAggregation.clientRpc ? 'present' : 'missing'}`)
  console.log(`    - loader fast path: ${value.summary.supabaseAggregation.loaderFastPath ? 'present' : 'missing'}`)
  console.log('  lazy panel hydration:')
  console.log(`    - API wrapper: ${value.summary.lazyPanelHydration.apiWrapper ? 'present' : 'missing'}`)
  console.log(`    - base rows skip heavy signals: ${value.summary.lazyPanelHydration.baseRowsSkipOperationalSignals ? 'yes' : 'no'}`)
  console.log(`    - panel wrapper: ${value.summary.lazyPanelHydration.panelWrapper ? 'present' : 'missing'}`)
  console.log(`    - stale-load token: ${value.summary.lazyPanelHydration.staleLoadToken ? 'present' : 'missing'}`)
  console.log('  rollups:')
  console.log(`    - table: ${value.summary.rollups.table ? 'present' : 'missing'}`)
  console.log(`    - refresh RPC: ${value.summary.rollups.refreshRpc ? 'present' : 'missing'}`)
  console.log(`    - aggregate prefers rollups: ${value.summary.rollups.aggregatePrefersRollups ? 'yes' : 'no'}`)
  console.log(`    - client refresh RPC: ${value.summary.rollups.clientRefreshRpc ? 'present' : 'missing'}`)
  console.log(`    - client metadata: ${value.summary.rollups.clientMetadata ? 'present' : 'missing'}`)
  console.log('  rollout:')
  console.log(`    - helper: ${value.summary.rollout.helper ? 'present' : 'missing'}`)
  console.log(`    - aggregate role flag: ${value.summary.rollout.aggregateRoleFlag ? 'present' : 'missing'}`)
  console.log(`    - lazy panel role flag: ${value.summary.rollout.lazyPanelRoleFlag ? 'present' : 'missing'}`)
  console.log(`    - rollup refresh flag: ${value.summary.rollout.rollupRefreshFlag ? 'present' : 'missing'}`)
  console.log(`    - aggregate loader gate: ${value.summary.rollout.aggregateLoaderGate ? 'present' : 'missing'}`)
  console.log(`    - lazy panel loader gate: ${value.summary.rollout.lazyPanelLoaderGate ? 'present' : 'missing'}`)
  console.log('  dynamic counts:')
  for (const [key, count] of Object.entries(value.summary.dynamicCounts)) {
    console.log(`    - ${key}: ${count}`)
  }
  console.log('  hydration surfaces:')
  for (const item of value.surfaces) {
    const marker = item.present ? 'present' : 'missing'
    console.log(`    - [${item.risk}] ${item.id}: ${marker}`)
    if (item.present) console.log(`      ${item.detail}`)
  }
  console.log(`  enforce mode: ${value.enforce ? 'on' : 'off'}`)
}
