import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  evaluateTargetFlowPerformanceBudget,
  evaluateTargetFlowReleaseGate,
  TARGET_FLOW_PERFORMANCE_BUDGETS,
} from '../src/services/observability/targetFlowPerformanceBudget.js'

const root = resolve(import.meta.dirname, '..')
const traceSource = readFileSync(resolve(root, 'src/lib/performanceTrace.js'), 'utf8')

function sample(page, overrides = {}) {
  const route = page === 'lead_detail' ? '/pipeline/leads/:id' : page === 'listing_detail' ? '/agent/listings/:id' : `/${page}`
  const value = { route, firstUsefulContentMs: 400, requestCount: 1, duplicateRequestCount: 0, schemaErrorCount: 0, slowRequestCount: 0, metadata: { page }, ...overrides }
  return { ...value, targetBudget: evaluateTargetFlowPerformanceBudget(value) }
}

assert.deepEqual(Object.keys(TARGET_FLOW_PERFORMANCE_BUDGETS).sort(), ['lead_detail', 'listing_detail', 'listings', 'transactions'])
assert.equal(evaluateTargetFlowPerformanceBudget(sample('lead_detail')).status, 'PASS')
assert.equal(evaluateTargetFlowPerformanceBudget(sample('lead_detail', { duplicateRequestCount: 1 })).status, 'FAIL')
assert.equal(evaluateTargetFlowReleaseGate(['transactions', 'listings', 'listing_detail', 'lead_detail'].map(sample), { minimumSamplesPerFlow: 1 }).status, 'PASS')
assert.match(traceSource, /TARGET_FLOW_HISTORY_STORAGE_KEY/)
assert.match(traceSource, /evaluateTargetFlowPerformanceBudget/)
assert.match(traceSource, /sessionStorage\.setItem\('arch9:route-performance-latest'/)
assert.doesNotMatch(traceSource, /fetch\(|setInterval|setTimeout/)

console.log('target-flow performance phase 6 checks passed')
