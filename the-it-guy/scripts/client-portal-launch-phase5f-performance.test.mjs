import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const [contract, packet, metricsHook, performanceService] = await Promise.all([
  readFile(new URL('config/client-portal-launch-contract.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('config/client-portal-launch-phase5f-performance.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('src/hooks/useClientPortalLaunchMetrics.js', root), 'utf8'),
  readFile(new URL('src/services/observability/performanceMetrics.js', root), 'utf8')
])

test('performance protocol is mobile, repeatable and uses p75', () => {
  assert.deepEqual(packet.protocol.viewport, { width: 390, height: 844 })
  assert.ok(packet.protocol.minimumSampleCount >= 5)
  assert.equal(packet.protocol.aggregation, 'p75')
  assert.deepEqual(packet.protocol.personas, ['buyer', 'seller'])
})

test('every Phase 0 performance and stability budget has a measurement', () => {
  assert.deepEqual(Object.keys(packet.measurements), [
    'buyerUsefulContentMs', 'sellerUsefulContentMs', 'slowNetworkCoreContentMs', 'cachedNavigationMs',
    'maximumCumulativeLayoutShift', 'routeCrashCount', 'deadControlCount'
  ])
  assert.equal(contract.performanceBudgets.mobileUsefulContentMs, 1500)
  assert.equal(contract.performanceBudgets.mobileSlowNetworkCoreContentMs, 2500)
  assert.equal(contract.performanceBudgets.cachedNavigationResponseMs, 100)
})

test('runtime instrumentation publishes privacy-safe useful content, LCP and CLS', () => {
  assert.match(metricsHook, /usefulContentMs/)
  assert.match(metricsHook, /largestContentfulPaintMs/)
  assert.match(metricsHook, /cumulativeLayoutShift/)
  assert.doesNotMatch(metricsHook, /(?:token|email|phone)\s*:/i)
  assert.match(performanceService, /client_portal\.mobile\.useful_content/)
})

test('missing performance samples fail closed', () => {
  const result = spawnSync(process.execPath, ['scripts/client-portal-launch-phase5f-performance.mjs'], {
    cwd: new URL('.', root),
    encoding: 'utf8'
  })
  assert.equal(result.status, 0)
  const report = JSON.parse(result.stdout)
  assert.equal(report.decision, 'HOLD')
  assert.ok(!report.blockers.includes('candidate:deploymentId'))
  assert.ok(report.blockers.includes('measurement:buyerUsefulContentMs'))
  assert.ok(report.blockers.includes('sample_count:cachedNavigationMs'))
})

test('enforced performance certification rejects incomplete measurements', () => {
  const result = spawnSync(process.execPath, ['scripts/client-portal-launch-phase5f-performance.mjs', '--enforce'], {
    cwd: new URL('.', root),
    encoding: 'utf8'
  })
  assert.notEqual(result.status, 0)
})
