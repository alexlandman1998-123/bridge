import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  approveConveyancerRelease,
  authoriseConveyancerRelease,
  buildConveyancerKillSwitch,
  buildConveyancerOperationalPolicy,
  buildConveyancerReleaseCandidate,
  createConveyancerReleaseCandidate,
  evaluateConveyancerOperationalMetrics,
  evaluateConveyancerReleaseGate,
  persistConveyancerKillSwitch,
  persistConveyancerOperationalPolicy,
  recordConveyancerReleaseActivation,
  rollbackConveyancerRelease,
} from '../conveyancerOperationalAssurance.js'

const migration = readFileSync(new URL('../../../../../supabase/migrations/202607160011_conveyancer_productisation_p8.sql', import.meta.url), 'utf8')
const monitor = readFileSync(new URL('../../../../../supabase/functions/conveyancer-operations-monitor/index.ts', import.meta.url), 'utf8')
const runtime = readFileSync(new URL('../../../../../supabase/functions/conveyancer-provider-runtime/index.ts', import.meta.url), 'utf8')
const webhook = readFileSync(new URL('../../../../../supabase/functions/conveyancer-provider-webhook/index.ts', import.meta.url), 'utf8')
const dispatcher = readFileSync(new URL('../../../../../supabase/functions/dispatch-conveyancer-provider-commands/index.ts', import.meta.url), 'utf8')
const cockpit = readFileSync(new URL('../../../components/attorney/cockpit/ConveyancerCockpit.jsx', import.meta.url), 'utf8')
const guidedExperience = readFileSync(new URL('../conveyancerGuidedExperience.js', import.meta.url), 'utf8')
const orgId = '10000000-0000-4000-8000-000000000001'; const firmId = '20000000-0000-4000-8000-000000000001'; const profileId = '30000000-0000-4000-8000-000000000001'; const matterId = '40000000-0000-4000-8000-000000000001'; const userId = '50000000-0000-4000-8000-000000000001'; const at = '2026-07-16T14:00:00.000Z'; const hash = `sha256:${'a'.repeat(64)}`
const pending = []
function test(name, fn) { try { const result = fn(); if (result?.then) { pending.push(result.then(() => console.log(`ok - ${name}`))); return } console.log(`ok - ${name}`) } catch (error) { console.error(`not ok - ${name}`); throw error } }
function policy(overrides = {}) { return buildConveyancerOperationalPolicy({ scope: 'firm', organisationId: orgId, attorneyFirmId: firmId, reason: 'P8 production thresholds', ...overrides }) }
function candidate(overrides = {}) { return buildConveyancerReleaseCandidate({ releaseId: 'release:p8:1', releaseVersion: '2026.07.16.1', targetEnvironment: 'production', rolloutMode: 'pilot', commitSha: 'abcdef1234567890', artifactReference: 'artifact://release/p8', artifactHash: hash, rollbackReference: 'artifact://release/p7', rollbackHash: hash, pilotTransactionIds: [matterId], evidence: { testsReference: 'ci://p8/tests', testsHash: hash, securityReference: 'ci://p8/security', securityHash: hash, recoveryReference: 'runbook://p8/recovery', recoveryHash: hash }, createdBy: userId, createdAt: at, ...overrides }) }

test('classifies queue, reliability and review health against a versioned firm policy', () => {
  assert.equal(policy().ok, true)
  assert.equal(evaluateConveyancerOperationalMetrics(policy().policy, { queueDepth: 0, successRatePercent: 100 }).health, 'pass')
  assert.equal(evaluateConveyancerOperationalMetrics(policy().policy, { inboundAwaitingReview: 26 }).health, 'warning')
  const failed = evaluateConveyancerOperationalMetrics(policy().policy, { deadLetters: 1, successRatePercent: 90 })
  assert.equal(failed.health, 'fail'); assert.ok(failed.blockers.includes('dead_letters_present')); assert.ok(failed.blockers.includes('success_rate_below_minimum'))
})

test('binds kill switches to an exact authority scope and keeps secrets out', () => {
  const valid = buildConveyancerKillSwitch({ scope: 'profile', organisationId: orgId, attorneyFirmId: firmId, profileId, direction: 'outbound', enabled: true, reason: 'Provider receipts are inconsistent.', requestedBy: userId, requestedAt: at })
  assert.equal(valid.ok, true); assert.match(valid.killSwitch.fingerprint, /^fnv1a_/)
  assert.ok(buildConveyancerKillSwitch({ ...valid.killSwitch, profileId: '' }).errors.includes('kill_switch_scope_binding_invalid'))
  assert.ok(buildConveyancerKillSwitch({ ...valid.killSwitch, clientSecret: 'raw' }).errors.includes('kill_switch_contains_secret'))
})

test('requires immutable artifact, test, security and recovery evidence plus a production pilot cohort', () => {
  assert.equal(candidate().ok, true, JSON.stringify(candidate().errors))
  assert.ok(candidate({ artifactHash: 'weak' }).errors.includes('release_evidence_invalid'))
  assert.ok(candidate({ pilotTransactionIds: [] }).errors.includes('release_pilot_cohort_required'))
  assert.ok(candidate({ accessToken: 'raw' }).errors.includes('release_contains_secret'))
})

test('opens only for three independently approved roles, fresh passing telemetry and no global stop', () => {
  const approvals = ['operations', 'security', 'legal'].map((role, index) => ({ role, decision: 'approved', approvedBy: `user-${index}` }))
  const open = evaluateConveyancerReleaseGate({ candidate: candidate().candidate, approvals, snapshot: { health: 'pass', capturedAt: at }, asOf: '2026-07-16T14:04:00.000Z' })
  assert.equal(open.allowed, true, JSON.stringify(open.blockers))
  assert.ok(evaluateConveyancerReleaseGate({ candidate: candidate().candidate, approvals: approvals.map((item) => ({ ...item, approvedBy: 'same-user' })), snapshot: { health: 'pass', capturedAt: at }, asOf: at }).blockers.includes('release_approver_separation_required'))
  assert.ok(evaluateConveyancerReleaseGate({ candidate: candidate().candidate, approvals, snapshot: { health: 'pass', capturedAt: at }, asOf: at, activeGlobalKillSwitch: true }).blockers.includes('release_global_kill_switch_active'))
})

test('uses guarded RPCs for policy, stops, approval, authorisation, activation and rollback', async () => {
  const calls = []; const client = { rpc: async (name) => { calls.push(name); return { data: { ok: true }, error: null } } }
  await persistConveyancerOperationalPolicy(client, policy().policy)
  await persistConveyancerKillSwitch(client, buildConveyancerKillSwitch({ scope: 'firm', organisationId: orgId, attorneyFirmId: firmId, enabled: true, reason: 'Pause traffic.', requestedBy: userId, requestedAt: at }).killSwitch)
  await createConveyancerReleaseCandidate(client, candidate().candidate)
  await approveConveyancerRelease(client, { releaseCandidateId: matterId, role: 'operations', decision: 'approved', reason: 'Runbook checked.' })
  await authoriseConveyancerRelease(client, { releaseCandidateId: matterId, reason: 'All gates pass.' })
  await recordConveyancerReleaseActivation(client, { authorisationEventId: matterId, deploymentReference: 'deploy://production/1', artifactHash: hash })
  await rollbackConveyancerRelease(client, { releaseCandidateId: matterId, reason: 'Receipt latency exceeded threshold.' })
  assert.deepEqual(calls, ['bridge_set_conveyancer_operational_policy', 'bridge_set_conveyancer_provider_kill_switch', 'bridge_create_conveyancer_release_candidate', 'bridge_approve_conveyancer_release', 'bridge_authorise_conveyancer_release', 'bridge_record_conveyancer_release_activation', 'bridge_rollback_conveyancer_release'])
})

test('migration persists telemetry, alerts, incidents, controls and independently approved releases', () => {
  for (const table of ['conveyancer_operational_policies', 'conveyancer_operational_signals', 'conveyancer_operational_snapshots', 'conveyancer_operational_alerts', 'conveyancer_provider_incidents', 'conveyancer_provider_kill_switches', 'conveyancer_release_candidates', 'conveyancer_release_approvals', 'conveyancer_release_events']) assert.match(migration, new RegExp(`create table if not exists public\\.${table}`))
  assert.match(migration, /bridge_conveyancer_provider_operation_allowed/); assert.match(migration, /for update of command skip locked/i); assert.match(migration, /count\(distinct approved_by\)/i); assert.match(migration, /snapshot.*interval'5 minutes'/is)
  assert.match(migration, /bridge_record_conveyancer_release_activation/); assert.match(migration, /already consumed/i); assert.match(migration, /p_artifact_hash<>v_candidate\.artifact_hash/i); assert.match(migration, /to service_role/)
  assert.match(migration, /release_candidate_id,event_type,reason,created_by\)values\(p_release_candidate_id,'rolled_back'/i); assert.match(migration, /scope,direction,enabled.*'global','all',true/is); assert.match(migration, /before update or delete on public\.%I/i)
  assert.doesNotMatch(migration, /grant execute on function public\.bridge_record_conveyancer_release_activation\([^\n]+to authenticated/i)
})

test('runtime, webhook and dispatcher honour the stop plane and emit operational signals', () => {
  assert.match(runtime, /bridge_conveyancer_provider_operation_allowed/); assert.match(webhook, /bridge_conveyancer_provider_operation_allowed/)
  assert.match(runtime, /provider_operational_kill_switch_active/); assert.match(webhook, /provider_operational_kill_switch_active/)
  assert.match(webhook, /bridge_record_conveyancer_operational_signal/); assert.match(dispatcher, /bridge_record_conveyancer_operational_signal/)
})

test('protected monitor captures snapshots while the cockpit exposes safe stop and alert state', () => {
  assert.match(monitor, /x-p8-monitor-secret/); assert.match(monitor, /CONVEYANCER_OPERATIONS_MONITOR_SECRET/); assert.match(monitor, /bridge_capture_conveyancer_operational_snapshots/)
  assert.match(cockpit, /loadConveyancerOperational(?:ApplicationH8)?Summary/); assert.match(guidedExperience, /Stopped safely/); assert.match(cockpit, /openAlerts/)
})

await Promise.all(pending)
console.log('P8 conveyancer operational assurance tests passed.')
