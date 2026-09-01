import assert from 'node:assert/strict'

const DEFAULT_ORIGIN = 'https://app.arch9.co.za'

function normalizeOrigin(value = DEFAULT_ORIGIN) {
  return String(value || DEFAULT_ORIGIN).trim().replace(/\/+$/, '')
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = { origin: DEFAULT_ORIGIN, failOnMismatch: false }
  for (const arg of argv) {
    if (arg.startsWith('--origin=')) options.origin = normalizeOrigin(arg.split('=').slice(1).join('='))
    if (arg === '--fail-on-mismatch') options.failOnMismatch = true
  }
  return options
}

export function extractJavaScriptAssets(source = '') {
  return [...new Set(
    [...String(source).matchAll(/assets\/[A-Za-z0-9_.-]+\.js/g)].map((match) => match[0]),
  )]
}

function findSingleAsset(assets, prefix) {
  const matches = assets.filter((asset) => asset.startsWith(`assets/${prefix}-`))
  assert.equal(matches.length, 1, `Expected one deployed ${prefix} asset, found ${matches.length}.`)
  return matches[0]
}

export function evaluateAgentProductionDeployment({ assets = [], sources = {} } = {}) {
  const assetSet = new Set(assets)
  const entry = sources.entry || ''
  const header = sources.header || ''
  const clients = sources.clients || ''
  const listings = sources.listings || ''
  const canvassing = sources.canvassing || ''
  const leadDetail = sources.leadDetail || ''
  const transactionDetail = sources.transactionDetail || ''

  const checks = [
    {
      id: 'broken_global_search_removed',
      passed: ![
        'Search transactions, clients, listings...',
        'Search unit, buyer, stage...',
        'Search applications, tenants, properties...',
      ].some((marker) => header.includes(marker)),
      evidence: 'Retired global-search placeholders are absent from the deployed HeaderBar chunk.',
      failureEvidence: 'The deployed HeaderBar still contains a retired global-search placeholder.',
    },
    {
      id: 'desktop_notification_dead_end_removed',
      passed: !header.includes('View all notifications') && header.includes('Recent notifications'),
      evidence: 'The deployed notification drawer no longer links desktop users into the mobile module.',
      failureEvidence: 'The deployed notification drawer still exposes the desktop-to-mobile notification link.',
    },
    {
      id: 'agent_reports_retired',
      passed: ![...assetSet].some((asset) => asset.startsWith('assets/AgentReportingPage-')),
      evidence: 'The retired Agent reporting route is absent from the deployed asset graph.',
      failureEvidence: 'The deployed asset graph still includes AgentReportingPage.',
    },
    {
      id: 'clients_performance_instrumented',
      passed: clients.includes('data-performance-settled') && (
        clients.includes('agent_clients.route.core_ready') || clients.includes('agentRoutePerformanceBaseline-')
      ),
      evidence: 'Clients exposes core-ready and settled production checkpoints.',
      failureEvidence: 'The deployed Clients chunk does not include the new core-ready and settled checkpoints.',
    },
    {
      id: 'listings_core_first',
      passed: listings.includes('coreFieldsOnly'),
      evidence: 'Listings requests schema-stable core rows before detailed hydration.',
      failureEvidence: 'The deployed Listings chunk does not include core-first summary loading.',
    },
    {
      id: 'canvassing_core_first',
      passed: canvassing.includes('coreFieldsOnly'),
      evidence: 'Canvassing uses lightweight listing support data after its primary workspace.',
      failureEvidence: 'The deployed Canvassing chunk does not include lightweight support-data loading.',
    },
    {
      id: 'lead_detail_core_first',
      passed: leadDetail.includes('routeCoreOnly'),
      evidence: 'Lead detail distinguishes route-core data from background full hydration.',
      failureEvidence: 'The deployed lead-detail chunk does not include route-core/background hydration separation.',
    },
    {
      id: 'transaction_detail_core_first',
      passed: transactionDetail.includes('fetchTransactionRouteCoreById'),
      evidence: 'Transaction detail uses the stable route-core loader before compatibility hydration.',
      failureEvidence: 'The deployed transaction-detail chunk still uses the pre-Phase-4 loading path.',
    },
    {
      id: 'command_palette_retired',
      passed: !entry.includes('CommandPalette'),
      evidence: 'The unused command-palette chunk is absent from the deployed entry graph.',
      failureEvidence: 'The deployed entry graph still includes CommandPalette.',
    },
  ]

  const normalizedChecks = checks.map(({ failureEvidence, ...check }) => ({
    ...check,
    evidence: check.passed ? check.evidence : failureEvidence,
  }))
  const failedChecks = normalizedChecks.filter((check) => !check.passed)
  return {
    contract: 'arch9-agent-production-validation-phase5-v1',
    status: failedChecks.length ? 'FAIL' : 'PASS',
    checks: normalizedChecks,
    failedChecks: failedChecks.map(({ id, evidence }) => ({ id, evidence })),
  }
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { accept: 'text/html,application/javascript' } })
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}.`)
  return response.text()
}

export async function validateAgentProductionDeployment({ origin = DEFAULT_ORIGIN } = {}) {
  const normalizedOrigin = normalizeOrigin(origin)
  const html = await fetchText(`${normalizedOrigin}/`)
  const htmlAssets = extractJavaScriptAssets(html)
  const entryAsset = findSingleAsset(htmlAssets, 'index')
  const entry = await fetchText(`${normalizedOrigin}/${entryAsset}`)
  const assets = [...new Set([...htmlAssets, ...extractJavaScriptAssets(entry)])]
  const assetMap = {
    header: findSingleAsset(assets, 'HeaderBar'),
    clients: findSingleAsset(assets, 'Clients'),
    listings: findSingleAsset(assets, 'AgentListings'),
    canvassing: findSingleAsset(assets, 'PipelineCanvassingPage'),
    leadDetail: findSingleAsset(assets, 'AgencyPipelinePage'),
    transactionDetail: findSingleAsset(assets, 'AttorneyTransactionDetail'),
  }
  const sourceEntries = await Promise.all(Object.entries(assetMap).map(async ([key, asset]) => (
    [key, await fetchText(`${normalizedOrigin}/${asset}`)]
  )))
  const report = evaluateAgentProductionDeployment({
    assets,
    sources: { entry, ...Object.fromEntries(sourceEntries) },
  })
  return {
    ...report,
    origin: normalizedOrigin,
    checkedAt: new Date().toISOString(),
    deployment: { entryAsset, ...assetMap },
  }
}

async function main() {
  const options = parseArgs()
  const report = await validateAgentProductionDeployment(options)
  console.log(JSON.stringify(report, null, 2))
  if (options.failOnMismatch && report.status !== 'PASS') process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
