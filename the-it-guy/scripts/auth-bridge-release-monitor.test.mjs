import assert from 'node:assert/strict'
import { buildReleaseMonitorReport } from './auth-bridge-release-monitor.mjs'

const checkedAt = '2026-08-14T12:00:00.000Z'
const thresholds = {
  maxDegradedRate: 0.01,
  maxAuthErrorRate: 0.03,
  maxWorkspaceTimeouts: 0,
  maxMissingColumnEvents: 0,
  maxWorkspaceP95Ms: 2_500,
}

const healthyEvents = [
  { event_name: 'auth_boot_success', category: 'auth', severity: 'info', metadata: {}, created_at: checkedAt },
  { event_name: 'auth_boot_success', category: 'auth', severity: 'info', metadata: {}, created_at: checkedAt },
  { event_name: 'auth_boot_success', category: 'auth', severity: 'info', metadata: {}, created_at: checkedAt },
]

const healthyMetrics = [
  { metric_name: 'workspace.resolveCurrentWorkspace', duration_ms: 380, metadata: {}, created_at: checkedAt },
  { metric_name: 'workspace.resolveCurrentWorkspace', duration_ms: 420, metadata: {}, created_at: checkedAt },
  { metric_name: 'workspace.resolveCurrentWorkspace', duration_ms: 520, metadata: {}, created_at: checkedAt },
]

const healthy = buildReleaseMonitorReport({
  events: healthyEvents,
  metrics: healthyMetrics,
  checkedAt,
  thresholds,
})

assert.equal(healthy.releaseRecommended, true)
assert.equal(healthy.counts.authBootSuccess, 3)
assert.equal(healthy.counts.authBootDegraded, 0)
assert.equal(healthy.performance.workspaceP95Ms, 520)
assert.deepEqual(healthy.blockers, [])

const blocked = buildReleaseMonitorReport({
  events: [
    ...healthyEvents,
    {
      event_name: 'auth_boot_degraded',
      category: 'auth',
      severity: 'warning',
      metadata: { reason: 'workspace.resolveCurrentWorkspace timed out.' },
      created_at: checkedAt,
    },
    {
      event_name: 'error',
      category: 'auth_error',
      severity: 'error',
      metadata: { message: 'transactions.branch_id does not exist', code: '42703' },
      created_at: checkedAt,
    },
  ],
  metrics: [
    ...healthyMetrics,
    { metric_name: 'workspace.resolveCurrentWorkspace', duration_ms: 3_900, metadata: {}, created_at: checkedAt },
  ],
  checkedAt,
  thresholds,
})

assert.equal(blocked.releaseRecommended, false)
for (const code of [
  'AUTH_BOOT_DEGRADED_RATE_HIGH',
  'AUTH_ERROR_RATE_HIGH',
  'WORKSPACE_TIMEOUTS_PRESENT',
  'SCHEMA_DRIFT_EVENTS_PRESENT',
  'WORKSPACE_P95_TOO_SLOW',
]) {
  assert.ok(blocked.blockers.some((item) => item.code === code), `Expected blocker ${code}`)
}

console.log('Auth bridge release monitor contract verified')
