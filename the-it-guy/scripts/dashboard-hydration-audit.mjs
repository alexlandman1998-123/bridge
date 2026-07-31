import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const enforce = process.argv.includes('--enforce')
const json = process.argv.includes('--json')

const files = {
  dashboardPage: path.join(root, 'src/pages/Dashboard.jsx'),
  overviewApi: path.join(root, 'src/lib/api/dashboardOverviewApi.js'),
  transactionSummaryApi: path.join(root, 'src/lib/api/dashboardTransactionSummaryApi.js'),
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
      'fetchDashboardOverview({',
      'fetchTransactionsByParticipantSummary({',
      'fetchTransactionsListSummary({',
    ],
    detail: 'Dashboard initial load can enter the developer overview, participant summary, or principal list summary paths.',
  }),
  surface({
    id: 'developer_overview_unit_hydration',
    file: 'src/lib/api/dashboardOverviewApi.js',
    risk: 'high',
    evidence: [
      'units = await fetchUnitsBase(client, developmentId)',
      'await hydrateUnitRows(client, units)',
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
  contract: 'dashboard-hydration-phase0-v1',
  summary: {
    presentSurfaceCount: presentCount,
    highRiskSurfaceCount: highRiskCount,
    mediumRiskSurfaceCount: mediumRiskCount,
    dynamicCounts,
  },
  budgets: {
    maxPresentSurfaces: 12,
    maxHighRiskSurfaces: 5,
    maxDashboardLoaderEntrypoints: 4,
    maxOverviewTransactionIdInFilters: 2,
    maxOverviewUnitIdInFilters: 4,
    maxTransactionSummaryTransactionIdInFilters: 8,
    maxTransactionSummaryIdBatchFilters: 4,
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
