import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { evaluateAgentScalePhase8 } from './agent-scale-phase8-pilot-observation.mjs'

const config = JSON.parse(readFileSync('config/agent-scale-phase8-pilot-observation.json', 'utf8'))
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const revision = 'a'.repeat(40)
const organisationId = '123e4567-e89b-42d3-a456-426614174000'
const phase7 = {
  contract: 'arch9-agent-phase7-pilot-boundary-v1', evaluatedAt: '2026-09-05T08:00:00.000Z', status: 'READY_FOR_PILOT', evidenceDigest: '1'.repeat(64),
  evidence: { sourceRevision: revision, deploymentOrigin: 'https://app.arch9.co.za', pilotOrganisationId: organisationId, featureFlag: 'agent_scale_pilot' },
}
const observation = {
  contract: 'arch9-agent-scale-phase8-pilot-observation-evidence-v1', phase7EvidenceDigest: phase7.evidenceDigest,
  startedAt: '2026-09-05T09:00:00.000Z', endedAt: '2026-09-06T09:00:00.000Z',
  identity: { sourceRevision: revision, deploymentOrigin: 'https://app.arch9.co.za', pilotOrganisationId: organisationId, featureFlag: 'agent_scale_pilot' },
  metrics: { sessions: 100, calendarRouteSamples: 40, technicalErrorRatePercent: 0.2, failedRequestRatePercent: 0.5, calendarCoreReadyP95Ms: 2200, crossOrganisationLeakageCount: 0, unexpectedRlsDenialCount: 0, criticalIncidentCount: 0, unresolvedHighIncidentCount: 0 },
  rollbackDrill: { completedInMinutes: 12, killSwitchWorked: true },
  review: { monitoringOwner: 'Monitoring Owner', supportOwner: 'Support Owner' },
}
const now = new Date('2026-09-06T10:00:00.000Z')

const ready = evaluateAgentScalePhase8({ config, phase7, observation, now })
assert.equal(ready.status, 'READY_TO_SCALE')
assert.match(ready.evidenceDigest, /^[0-9a-f]{64}$/)
assert.match(ready.authorization, /does not deploy/)

const failureCases = [
  (value) => { value.phase7.status = 'HOLD' },
  (value) => { value.observation.phase7EvidenceDigest = '2'.repeat(64) },
  (value) => { value.observation.endedAt = '2026-09-05T20:00:00.000Z' },
  (value) => { value.observation.identity.sourceRevision = 'b'.repeat(40) },
  (value) => { value.observation.metrics.sessions = 99 },
  (value) => { value.observation.metrics.technicalErrorRatePercent = 0.6 },
  (value) => { value.observation.metrics.crossOrganisationLeakageCount = 1 },
  (value) => { value.observation.rollbackDrill.completedInMinutes = 16 },
  (value) => { value.observation.rollbackDrill.killSwitchWorked = false },
]
for (const mutate of failureCases) {
  const value = structuredClone({ config, phase7, observation })
  mutate(value)
  assert.equal(evaluateAgentScalePhase8({ ...value, now }).status, 'HOLD')
}

assert.equal(typeof packageJson.scripts['test:agent-scale-phase8'], 'string')
assert.match(packageJson.scripts['verify:agent-scale-phase8'], /verify:agent-scale-phase7/)
assert.equal(typeof packageJson.scripts['check:agent-scale-phase8'], 'string')

console.log('Agent scale Phase 8 pilot-observation checks passed.')
