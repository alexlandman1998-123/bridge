const CONTRACT_VERSION = 'arch9-target-flow-performance-budget-v1'
export const TARGET_FLOW_HISTORY_STORAGE_KEY = 'arch9:route-performance-history'

const REQUIRED_TARGET_FLOWS = Object.freeze([
  'transactions',
  'listings',
  'listing_detail',
  'lead_detail',
])

export const TARGET_FLOW_PERFORMANCE_BUDGETS = Object.freeze({
  transactions: Object.freeze({ firstUsefulContentMs: 2500, requestCount: 16, duplicateRequestCount: 0, schemaErrorCount: 0, slowRequestCount: 2 }),
  listings: Object.freeze({ firstUsefulContentMs: 2500, requestCount: 12, duplicateRequestCount: 0, schemaErrorCount: 0, slowRequestCount: 2 }),
  listing_detail: Object.freeze({ firstUsefulContentMs: 1500, requestCount: 4, duplicateRequestCount: 0, schemaErrorCount: 0, slowRequestCount: 1 }),
  lead_detail: Object.freeze({ firstUsefulContentMs: 1500, requestCount: 4, duplicateRequestCount: 0, schemaErrorCount: 0, slowRequestCount: 1 }),
})

const FAST_PATH_BUDGETS = Object.freeze({
  list_summary_handoff: Object.freeze({ firstUsefulContentMs: 500, requestCount: 0 }),
  route_record_seed: Object.freeze({ firstUsefulContentMs: 500, requestCount: 0 }),
})

function finiteNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

function percentile(values, fraction) {
  if (!values.length) return 0
  const sorted = values.map(finiteNumber).sort((left, right) => left - right)
  return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] * 10) / 10
}

function resolvePage(summary = {}) {
  const explicitPage = String(summary?.metadata?.page || '').trim().toLowerCase()
  if (TARGET_FLOW_PERFORMANCE_BUDGETS[explicitPage]) return explicitPage
  const route = String(summary?.route || '').trim().toLowerCase()
  if (route === '/transactions' || route === '/units' || route === '/deals') return 'transactions'
  if (route === '/listings') return 'listings'
  if (route.startsWith('/agent/listings/')) return 'listing_detail'
  if (route.startsWith('/pipeline/leads/')) return 'lead_detail'
  return ''
}

export function evaluateTargetFlowPerformanceBudget(summary = {}) {
  const page = resolvePage(summary)
  if (!page) return { contract: CONTRACT_VERSION, targeted: false, status: 'NOT_TARGETED', page: '', violations: [] }

  const source = String(summary?.metadata?.source || '').trim().toLowerCase()
  const budget = { ...TARGET_FLOW_PERFORMANCE_BUDGETS[page], ...(FAST_PATH_BUDGETS[source] || {}) }
  const violations = Object.entries(budget)
    .map(([metric, limit]) => {
      const actual = Math.round(finiteNumber(summary?.[metric]) * 10) / 10
      return actual > limit ? { metric, actual, limit } : null
    })
    .filter(Boolean)

  return { contract: CONTRACT_VERSION, targeted: true, status: violations.length ? 'FAIL' : 'PASS', page, source: source || 'default', fastPath: Boolean(FAST_PATH_BUDGETS[source]), budget, violations }
}

export function evaluateTargetFlowReleaseGate(history = [], { minimumSamplesPerFlow = 3 } = {}) {
  const samples = Array.isArray(history) ? history : []
  const flows = Object.fromEntries(REQUIRED_TARGET_FLOWS.map((page) => {
    const evaluations = samples.map((sample) => ({ sample, evaluation: evaluateTargetFlowPerformanceBudget(sample) }))
      .filter(({ evaluation }) => evaluation.targeted && evaluation.page === page)
    return [page, {
      sampleCount: evaluations.length,
      passingSamples: evaluations.filter(({ evaluation }) => evaluation.status === 'PASS').length,
      failingSamples: evaluations.filter(({ evaluation }) => evaluation.status === 'FAIL').length,
      firstUsefulContentP95Ms: percentile(evaluations.map(({ sample }) => sample.firstUsefulContentMs), 0.95),
      requestCountP95: percentile(evaluations.map(({ sample }) => sample.requestCount), 0.95),
      covered: evaluations.length >= minimumSamplesPerFlow,
    }]
  }))
  const missingFlows = REQUIRED_TARGET_FLOWS.filter((page) => !flows[page].covered)
  const failingFlows = REQUIRED_TARGET_FLOWS.filter((page) => flows[page].failingSamples > 0)
  return { contract: CONTRACT_VERSION, status: missingFlows.length ? 'INSUFFICIENT_DATA' : failingFlows.length ? 'FAIL' : 'PASS', ready: !missingFlows.length, minimumSamplesPerFlow, missingFlows, failingFlows, flows }
}

export function readTargetFlowReleaseGate(storage = typeof window !== 'undefined' ? window.sessionStorage : null, options = {}) {
  if (!storage?.getItem) return evaluateTargetFlowReleaseGate([], options)
  try {
    return evaluateTargetFlowReleaseGate(JSON.parse(storage.getItem(TARGET_FLOW_HISTORY_STORAGE_KEY) || '[]'), options)
  } catch {
    return evaluateTargetFlowReleaseGate([], options)
  }
}

export { CONTRACT_VERSION, REQUIRED_TARGET_FLOWS }
