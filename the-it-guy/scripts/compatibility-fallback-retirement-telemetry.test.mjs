import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  COMPATIBILITY_FALLBACK_EVIDENCE_VERSION,
  COMPATIBILITY_FALLBACK_IDS,
  buildCompatibilityFallbackRetirementDecision,
  buildCompatibilityFallbackTelemetryEvent,
} from '../src/services/observability/compatibilityFallbackTelemetry.js'

const canonical = buildCompatibilityFallbackTelemetryEvent({
  fallbackId: COMPATIBILITY_FALLBACK_IDS.attorneyDashboardSnapshot,
  sourceComponent: 'attorney_dashboard',
})
assert.equal(canonical.eventName, 'compatibility_canonical_path_succeeded')
assert.equal(canonical.metadata.fallbackId, 'attorney_dashboard_snapshot_rpc')

const fallback = buildCompatibilityFallbackTelemetryEvent({
  fallbackId: COMPATIBILITY_FALLBACK_IDS.attorneyDashboardSnapshot,
  usedFallback: true,
  reasonCode: 'snapshot_rpc_unavailable',
})
assert.equal(fallback.eventName, 'compatibility_fallback_used')
assert.equal(fallback.severity, 'warning')

assert.throws(
  () => buildCompatibilityFallbackTelemetryEvent({ fallbackId: 'unregistered_fallback' }),
  /Unknown compatibility fallback/,
)

const ready = buildCompatibilityFallbackRetirementDecision({
  fallbackId: COMPATIBILITY_FALLBACK_IDS.attorneyDashboardSnapshot,
  activeDays: 30,
  canonicalSuccessCount: 500,
  fallbackCount: 0,
  failureCount: 0,
})
assert.equal(ready.version, COMPATIBILITY_FALLBACK_EVIDENCE_VERSION)
assert.equal(ready.decision, 'READY_FOR_MANUAL_RETIREMENT')
assert.equal(ready.retirementApproved, true)
assert.equal(ready.automaticRetirementAllowed, false)
assert.equal(ready.compatibilityFallbackEnabled, true)

const activeFallback = buildCompatibilityFallbackRetirementDecision({
  fallbackId: COMPATIBILITY_FALLBACK_IDS.attorneyDashboardSnapshot,
  activeDays: 30,
  canonicalSuccessCount: 500,
  fallbackCount: 1,
})
assert.equal(activeFallback.decision, 'HOLD')
assert.equal(activeFallback.retirementApproved, false)
assert.deepEqual(activeFallback.failedChecks.map((check) => check.id), ['fallback_unused'])

const insufficientEvidence = buildCompatibilityFallbackRetirementDecision({
  fallbackId: COMPATIBILITY_FALLBACK_IDS.attorneyDashboardSnapshot,
  activeDays: 2,
  canonicalSuccessCount: 5,
})
assert.equal(insufficientEvidence.retirementApproved, false)
assert.deepEqual(insufficientEvidence.failedChecks.map((check) => check.id), ['observation_window', 'canonical_volume'])

const dashboardSource = readFileSync(new URL('../src/services/attorneyDashboard.js', import.meta.url), 'utf8')
assert.match(dashboardSource, /reasonCode: 'snapshot_rpc_available'/)
assert.match(dashboardSource, /reasonCode: 'snapshot_rpc_unavailable'/)

const apiSource = readFileSync(new URL('../src/lib/api.js', import.meta.url), 'utf8')
assert.match(apiSource, /fallbackId: COMPATIBILITY_FALLBACK_IDS\.transactionMutationMissingColumns/)
assert.match(apiSource, /usedFallback: retry\.removedColumns\.length > 0/)
assert.match(apiSource, /reasonCode: retry\.removedColumns\.length \? 'schema_columns_omitted' : 'canonical_schema_supported'/)

const migration = readFileSync(
  new URL('../../supabase/migrations/20260831190341_compatibility_fallback_retirement_telemetry.sql', import.meta.url),
  'utf8',
)
assert.match(migration, /security invoker/i)
assert.match(migration, /set search_path = ''/i)
assert.match(migration, /from public\.telemetry_events/i)
assert.match(migration, /metadata ->> 'fallbackId'/)
assert.match(migration, /grant execute .* to service_role/i)
assert.doesNotMatch(migration, /grant execute .* to authenticated/i)
assert.doesNotMatch(migration, /user_id|workspace_id|route/i)

console.log('Compatibility fallback retirement telemetry checks passed.')
