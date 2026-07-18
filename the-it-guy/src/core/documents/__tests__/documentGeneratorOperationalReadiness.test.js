import test from 'node:test'
import assert from 'node:assert/strict'
import { assessDocumentGeneratorOperationalReadiness, documentGeneratorOperationalMetrics } from '../documentGeneratorOperationalReadiness.js'

const now = Date.parse('2026-07-18T12:00:00Z')
const config = { status: 'ready', maximumWatchdogAgeMinutes: 90, operationsOwner: 'Operations lead', supportOwner: 'Support lead', incidentChannelReference: 'incidents', monitoringReference: 'watchdog/15m', supportRunbookReference: 'support.md', rollbackRunbookReference: 'rollback.md' }
const metrics = Object.fromEntries(documentGeneratorOperationalMetrics.map((key) => [key, 0]))
const watchdog = { id: 'snapshot-1', status: 'healthy', created_at: '2026-07-18T11:30:00Z', summary: { kind: 'legal_document_watchdog_v1', metrics, blockers: [] } }
const inputs = { g1: { status: 'READY_FOR_G2', ready: true }, g2: { status: 'READY_FOR_G3', ready: true }, config, watchdog, now }

test('passes only a fresh, covered and healthy operational chain', () => {
  assert.equal(assessDocumentGeneratorOperationalReadiness(inputs).ready, true)
})

test('rejects a false-green snapshot without F3-F5 coverage', () => {
  const partial = structuredClone(watchdog)
  delete partial.summary.metrics.missingTransactionPublications
  delete partial.summary.metrics.missingCompletionReceipts
  delete partial.summary.metrics.stuckCompletionRetries
  assert.equal(assessDocumentGeneratorOperationalReadiness({ ...inputs, watchdog: partial }).blockers.some((item) => item.code === 'G3_WATCHDOG_COVERAGE_INVALID'), true)
})

test('reports owners and active watchdog failures with workable solutions', () => {
  const failed = structuredClone(watchdog)
  failed.status = 'critical'
  failed.summary.metrics.stuckCompletionRetries = 1
  failed.summary.blockers = [{ code: 'FINAL_COMPLETION_RETRY_STUCK' }]
  const result = assessDocumentGeneratorOperationalReadiness({ ...inputs, config: { ...config, operationsOwner: '' }, watchdog: failed })
  assert.equal(result.ready, false)
  assert.ok(result.blockers.every((item) => item.solution))
  assert.ok(result.blockers.some((item) => item.code === 'G3_OPERATIONS_OWNER_MISSING'))
  assert.ok(result.blockers.some((item) => item.code === 'G3_WATCHDOG_ACTIVE_BLOCKERS'))
})
