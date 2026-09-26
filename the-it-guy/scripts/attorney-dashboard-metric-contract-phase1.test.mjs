import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ATTORNEY_DASHBOARD_METRIC_CONTRACT_VERSION,
  ATTORNEY_DASHBOARD_METRIC_SCOPE,
  ATTORNEY_DASHBOARD_METRICS,
  getAttorneyDashboardMetricContract,
} from '../src/services/attorneyDashboardMetricContract.js'

const requiredMetricKeys = [
  'matter_progress',
  'active_matters',
  'awaiting_client',
  'lodgements',
  'registrations',
  'revenue_pipeline',
  'signatures_pending',
  'guarantees_outstanding',
  'clearance_certificates',
  'client_documents',
  'invoices_overdue',
  'matters_stalled',
  'partner_active_matters',
  'partner_new_this_month',
  'partner_revenue_pipeline',
  'matter_health',
  'average_days_to_registration',
  'registration_success_rate',
  'average_document_turnaround',
  'registration_forecast',
  'matter_distribution',
]

assert.equal(ATTORNEY_DASHBOARD_METRIC_CONTRACT_VERSION, 'attorney_dashboard_metrics_v1')
assert.equal(ATTORNEY_DASHBOARD_METRIC_SCOPE.timezone, 'Africa/Johannesburg')
assert.match(ATTORNEY_DASHBOARD_METRIC_SCOPE.zeroMeaning, /read successfully/i)
assert.match(ATTORNEY_DASHBOARD_METRIC_SCOPE.unavailableMeaning, /absent|inaccessible|incomplete/i)
assert.match(ATTORNEY_DASHBOARD_METRIC_SCOPE.detailLimitRule, /never constrain aggregate metrics/i)

const actualKeys = ATTORNEY_DASHBOARD_METRICS.map((item) => item.key)
assert.deepEqual([...new Set(actualKeys)], actualKeys, 'Metric keys must be unique.')
for (const key of requiredMetricKeys) {
  const contract = getAttorneyDashboardMetricContract(key)
  assert.ok(contract, `Metric contract must include ${key}.`)
  assert.ok(contract.label, `${key} must have a label.`)
  assert.ok(contract.group, `${key} must have a group.`)
  assert.ok(contract.definition, `${key} must have a business definition.`)
  assert.ok(contract.grain, `${key} must define its count grain.`)
  assert.ok(contract.timeWindow, `${key} must define its time window.`)
  assert.ok(contract.sources.length, `${key} must identify an authoritative source.`)
  assert.ok(contract.drilldown.route, `${key} must identify its drill-down route.`)
  assert.equal(contract.drilldown.parityRequired, true, `${key} must require drill-down parity.`)
  assert.ok(Number.isInteger(contract.implementationPhase), `${key} must identify its implementation phase.`)
}

const revenue = getAttorneyDashboardMetricContract('revenue_pipeline')
assert.match(revenue.definition, /professional fees/i)
for (const forbidden of ['property value', 'VAT', 'transfer duty', 'disbursements', 'trust']) {
  assert.ok(revenue.exclusions.some((item) => item.toLowerCase().includes(forbidden.toLowerCase())), `Revenue Pipeline must exclude ${forbidden}.`)
}

const awaitingClient = getAttorneyDashboardMetricContract('awaiting_client')
assert.match(awaitingClient.definition, /counted once/i)

const health = getAttorneyDashboardMetricContract('matter_health')
assert.match(health.definition, /mutually exclusive/i)
assert.match(health.definition, /21 days/i)
assert.match(health.definition, /14 days/i)

const successRate = getAttorneyDashboardMetricContract('registration_success_rate')
assert.match(successRate.definition, /registered matters divided by/i)
assert.ok(successRate.exclusions.includes('active in-progress matters'))

const docs = readFileSync(new URL('../docs/attorney-dashboard-metric-contract-phase1.md', import.meta.url), 'utf8')
assert.ok(docs.includes(ATTORNEY_DASHBOARD_METRIC_CONTRACT_VERSION))
for (const key of requiredMetricKeys) {
  assert.ok(docs.includes(key), `Phase 1 documentation must cover ${key}.`)
}
assert.ok(docs.includes('No database schema, production data, or dashboard calculation is changed by Phase 1.'))

console.log(`Attorney dashboard metric contract Phase 1 passed for ${requiredMetricKeys.length} metrics.`)
