import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  evaluateTargetFlowPerformanceBudget,
  evaluateTargetFlowReleaseGate,
  readTargetFlowReleaseGate,
  TARGET_FLOW_PERFORMANCE_BUDGETS,
} from '../src/services/observability/targetFlowPerformanceBudget.js'

const telemetrySource = await readFile(new URL('../src/services/observability/queryBaselineTelemetry.js', import.meta.url), 'utf8')
const budgetSource = await readFile(new URL('../src/services/observability/targetFlowPerformanceBudget.js', import.meta.url), 'utf8')
const supabaseClientSource = await readFile(new URL('../src/lib/supabaseClient.js', import.meta.url), 'utf8')

function sample(page, overrides = {}) {
  const summary = {
    route: page === 'listing_detail' ? '/agent/listings/:id' : page === 'lead_detail' ? '/pipeline/leads/:id' : `/${page}`,
    firstUsefulContentMs: 400,
    requestCount: 1,
    duplicateRequestCount: 0,
    schemaErrorCount: 0,
    slowRequestCount: 0,
    metadata: { page },
    ...overrides,
  }
  return { ...summary, targetBudget: evaluateTargetFlowPerformanceBudget(summary) }
}

test('Phase 6 defines explicit budgets for every optimized flow', () => {
  assert.deepEqual(Object.keys(TARGET_FLOW_PERFORMANCE_BUDGETS).sort(), [
    'lead_detail',
    'listing_detail',
    'listings',
    'transactions',
  ])
  for (const budget of Object.values(TARGET_FLOW_PERFORMANCE_BUDGETS)) {
    assert.equal(budget.duplicateRequestCount, 0)
    assert.equal(budget.schemaErrorCount, 0)
    assert.ok(budget.firstUsefulContentMs > 0)
    assert.ok(budget.requestCount > 0)
  }
})

test('fast summary handoffs enforce zero requests before useful content', () => {
  const pass = evaluateTargetFlowPerformanceBudget(sample('listing_detail', {
    requestCount: 0,
    metadata: { page: 'listing_detail', source: 'list_summary_handoff' },
  }))
  assert.equal(pass.status, 'PASS')
  assert.equal(pass.fastPath, true)

  const regression = evaluateTargetFlowPerformanceBudget(sample('listing_detail', {
    requestCount: 1,
    metadata: { page: 'listing_detail', source: 'list_summary_handoff' },
  }))
  assert.equal(regression.status, 'FAIL')
  assert.deepEqual(regression.violations.map((item) => item.metric), ['requestCount'])
})

test('release gate fails closed until every target flow has coverage', () => {
  const incomplete = evaluateTargetFlowReleaseGate([sample('listings')], { minimumSamplesPerFlow: 1 })
  assert.equal(incomplete.status, 'INSUFFICIENT_DATA')
  assert.deepEqual(incomplete.missingFlows.sort(), ['lead_detail', 'listing_detail', 'transactions'])

  const covered = ['transactions', 'listings', 'listing_detail', 'lead_detail'].map((page) => sample(page))
  assert.equal(evaluateTargetFlowReleaseGate(covered, { minimumSamplesPerFlow: 1 }).status, 'PASS')
})

test('any covered flow regression blocks the release gate', () => {
  const history = ['transactions', 'listings', 'listing_detail', 'lead_detail'].map((page) => sample(page))
  history[3] = sample('lead_detail', { duplicateRequestCount: 1 })
  const gate = evaluateTargetFlowReleaseGate(history, { minimumSamplesPerFlow: 1 })
  assert.equal(gate.status, 'FAIL')
  assert.deepEqual(gate.failingFlows, ['lead_detail'])
})

test('browser report is bounded to existing session telemetry and adds no query source', () => {
  const history = ['transactions', 'listings', 'listing_detail', 'lead_detail'].map((page) => sample(page))
  const storage = { getItem: () => JSON.stringify(history) }
  assert.equal(readTargetFlowReleaseGate(storage, { minimumSamplesPerFlow: 1 }).status, 'PASS')
  assert.match(telemetrySource, /targetBudget: evaluateTargetFlowPerformanceBudget\(routeSummary\)/)
  assert.match(supabaseClientSource, /TARGET_FLOW_HISTORY_STORAGE_KEY/)
  assert.doesNotMatch(budgetSource, /fetch\(|supabase|setInterval|setTimeout|\.channel\(/)
})
