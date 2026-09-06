import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { evaluateAgentPhase7Pilot } from './agent-phase7-pilot-boundary.mjs'

const config = JSON.parse(readFileSync('config/agent-phase7-pilot-boundary.json', 'utf8'))
const validator = readFileSync('scripts/validate-agent-production-phase5.mjs', 'utf8')
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))

assert.equal(config.contract, 'arch9-agent-phase7-pilot-boundary-config-v2')
assert.equal(config.maximumPilotOrganisations, 1)
assert.equal(config.maximumRollbackMinutes, 15)
assert.match(validator, /release-manifest\.json/)
assert.match(validator, /calendar_scale_instrumented/)
assert.match(validator, /releaseId/)

const now = new Date('2026-09-06T12:00:00.000Z')
const revision = 'a'.repeat(40)
const phase6 = {
  contract: 'arch9-agent-phase6-release-readiness-v1', status: 'GO', evaluatedAt: '2026-09-06T10:00:00.000Z',
  evidenceDigests: { algorithm: 'sha256', config: '1'.repeat(64), rls: '2'.repeat(64), performance: '3'.repeat(64), browsers: { agent: '4'.repeat(64), principal: '5'.repeat(64), branch_manager: '6'.repeat(64) } },
}
const deployment = { contract: 'arch9-agent-production-validation-phase5-v1', status: 'PASS', checkedAt: '2026-09-06T11:00:00.000Z', origin: 'https://app.arch9.co.za', releaseId: revision }
const source = { revision, clean: true }
const pilot = { organisationId: '123e4567-e89b-42d3-a456-426614174000', owner: 'Pilot Owner', changeReference: 'CHG-1234', rollbackOwner: 'Rollback Owner', monitoringOwner: 'Monitoring Owner', supportOwner: 'Support Owner', featureFlag: 'agent_scale_pilot', killSwitchVerified: true, rollbackTargetMinutes: 15 }

assert.equal(evaluateAgentPhase7Pilot({ config, phase6, deployment, source, pilot, now }).status, 'READY_FOR_PILOT')

for (const mutate of [
  (value) => { value.deployment.releaseId = 'b'.repeat(40) },
  (value) => { value.phase6.evidenceDigests.performance = null },
  (value) => { value.pilot.killSwitchVerified = false },
  (value) => { value.pilot.rollbackTargetMinutes = 16 },
  (value) => { value.pilot.featureFlag = '' },
]) {
  const value = structuredClone({ config, phase6, deployment, source, pilot, now })
  mutate(value)
  assert.equal(evaluateAgentPhase7Pilot(value).status, 'HOLD')
}

assert.equal(typeof packageJson.scripts['test:agent-scale-phase7'], 'string')
assert.match(packageJson.scripts['verify:agent-scale-phase7'], /verify:agent-scale-phase6/)

console.log('Agent scale Phase 7 controlled-pilot checks passed.')
