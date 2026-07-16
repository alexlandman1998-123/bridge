import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildConveyancerApplicationKillSwitchH8, evaluateConveyancerDeploymentReadinessH8, persistConveyancerApplicationKillSwitchH8 } from '../conveyancerOperationalApplicationH8.js'

const migration = readFileSync(new URL('../../../../../supabase/migrations/20260716210001_conveyancer_h8_operational_application.sql', import.meta.url), 'utf8')
const monitor = readFileSync(new URL('../../../../../supabase/functions/conveyancer-operations-monitor/index.ts', import.meta.url), 'utf8')
const org = '10000000-0000-4000-8000-000000000001'; const firm = '20000000-0000-4000-8000-000000000001'; const user = '30000000-0000-4000-8000-000000000001'; const at = '2026-07-16T12:00:00Z'; const hash = `sha256:${'a'.repeat(64)}`

const stop = buildConveyancerApplicationKillSwitchH8({ requestId: 'stop:documents:1', component: 'documents', scope: 'firm', organisationId: org, attorneyFirmId: firm, enabled: true, reason: 'Generated documents require investigation.', requestedBy: user, requestedAt: at })
assert.equal(stop.ok, true)
assert.equal(buildConveyancerApplicationKillSwitchH8({ ...stop.killSwitch, component: 'documents', direction: 'outbound' }).ok, false)
const calls = []
const persisted = await persistConveyancerApplicationKillSwitchH8({ rpc: async (name, args) => { calls.push({ name, args }); return { data: { duplicate: false }, error: null } } }, stop.killSwitch)
assert.equal(persisted.ok, true)
assert.deepEqual(calls.map((call) => call.name), ['bridge_set_conveyancer_application_kill_switch_h8'])

const candidate = { releaseId: 'release:h8:1', releaseVersion: '1.0.0', targetEnvironment: 'production', rolloutMode: 'pilot', commitSha: 'abcdef1234', artifactReference: 'artifact://h8', artifactHash: hash, rollbackReference: 'artifact://h7', rollbackHash: hash, pilotTransactionIds: [firm], evidence: { testsReference: 'ci://tests', testsHash: hash, securityReference: 'ci://security', securityHash: hash, recoveryReference: 'runbook://recovery', recoveryHash: hash }, createdBy: user, createdAt: at }
const approvals = ['operations', 'security', 'legal'].map((role, index) => ({ role, decision: 'approved', approvedBy: `${user.slice(0, -1)}${index + 1}` }))
assert.equal(evaluateConveyancerDeploymentReadinessH8({ candidate, approvals, providerSnapshot: { health: 'pass', capturedAt: at }, applicationSnapshot: { health: 'pass', captured_at: at }, asOf: at }).allowed, true)
assert.ok(evaluateConveyancerDeploymentReadinessH8({ candidate, approvals, providerSnapshot: { health: 'pass', capturedAt: at }, applicationSnapshot: { health: 'fail', captured_at: at }, asOf: at }).blockers.includes('release_application_health_not_passing'))

for (const fragment of ['conveyancer_application_health_snapshots', 'bridge_capture_conveyancer_application_health_h8', 'bridge_set_conveyancer_application_kill_switch_h8', 'bridge_conveyancer_application_operation_allowed_h8', 'bridge_authorise_conveyancer_release_h8', 'conveyancer_h8_orchestration_guard', 'conveyancer_h8_notification_guard', 'conveyancer_h8_document_guard']) assert.match(migration, new RegExp(fragment))
assert.match(monitor, /bridge_capture_conveyancer_application_health_h8/)
assert.match(monitor, /applicationHealth/)

console.log('H8 conveyancer operational application tests passed.')
