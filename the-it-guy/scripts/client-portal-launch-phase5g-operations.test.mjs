import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const [packet, rollout, metricsHook] = await Promise.all([
  readFile(new URL('config/client-portal-launch-phase5g-operations.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('config/client-portal-launch-phase5-rollout.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('src/hooks/useClientPortalLaunchMetrics.js', root), 'utf8')
])

test('operations packet requires distinct accountable owners', () => {
  assert.deepEqual(Object.keys(packet.owners), ['monitoringOwner', 'supportOwner', 'rollbackOwner', 'productOwner'])
})

test('monitoring baseline includes runtime errors and privacy-safe portal metrics', () => {
  assert.equal(packet.monitoring.baseline.vercelRuntimeLogsAvailable, true)
  assert.equal(packet.monitoring.baseline.clientPortalLaunchMetricsAvailable, true)
  assert.match(metricsHook, /arch9-client-portal-launch-metrics-v1/)
  for (const signal of ['route-crashes', 'buyer-useful-content', 'seller-useful-content', 'confirmed-data-exposure']) {
    assert.ok(packet.monitoring.requiredSignals.includes(signal))
  }
})

test('rollback triggers and pilot boundary match the controlled rollout', () => {
  assert.deepEqual(packet.rollback.triggers, rollout.rollbackTriggers)
  assert.equal(packet.pilot.maximumAgencies, rollout.maximumPilotAgencies)
  assert.equal(packet.pilot.automaticExpansion, false)
  assert.equal(packet.pilot.observationHours, rollout.requiredObservationHoursBeforeExpansion)
})

test('missing owners, alert tests and rollback rehearsal fail closed', () => {
  const result = spawnSync(process.execPath, ['scripts/client-portal-launch-phase5g-operations.mjs'], {
    cwd: new URL('.', root),
    encoding: 'utf8'
  })
  assert.equal(result.status, 0)
  const report = JSON.parse(result.stdout)
  assert.equal(report.decision, 'HOLD')
  assert.ok(report.blockers.includes('owner:monitoringOwner'))
  assert.ok(report.blockers.includes('monitoring:alertTestResult'))
  assert.ok(report.blockers.includes('rollback:rehearsalResult'))
})

test('enforced operations certification rejects incomplete readiness', () => {
  const result = spawnSync(process.execPath, ['scripts/client-portal-launch-phase5g-operations.mjs', '--enforce'], {
    cwd: new URL('.', root),
    encoding: 'utf8'
  })
  assert.notEqual(result.status, 0)
})
