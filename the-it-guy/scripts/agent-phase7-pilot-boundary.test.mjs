import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { evaluateAgentPhase7Pilot } from './agent-phase7-pilot-boundary.mjs'

const config = JSON.parse(readFileSync('config/agent-phase7-pilot-boundary.json', 'utf8'))
const now = new Date('2026-09-06T12:00:00.000Z')
const phase6 = {
  contract: 'arch9-agent-phase6-release-readiness-v1',
  evaluatedAt: '2026-09-06T10:00:00.000Z',
  status: 'GO',
  blockers: [],
  evidenceDigests: {
    algorithm: 'sha256',
    config: '1'.repeat(64),
    rls: '2'.repeat(64),
    performance: '3'.repeat(64),
    browsers: { agent: '4'.repeat(64), principal: '5'.repeat(64), branch_manager: '6'.repeat(64) },
  },
}
const deployment = {
  contract: 'arch9-agent-production-validation-phase5-v1',
  checkedAt: '2026-09-06T11:00:00.000Z',
  status: 'PASS',
  origin: 'https://app.arch9.co.za',
  checks: [],
  releaseId: 'a'.repeat(40),
}
const source = { revision: 'a'.repeat(40), clean: true }
const pilot = {
  organisationId: '123e4567-e89b-42d3-a456-426614174000',
  owner: 'Release Owner',
  changeReference: 'CHG-1234',
  rollbackOwner: 'Rollback Owner',
  monitoringOwner: 'Monitoring Owner',
  supportOwner: 'Support Owner',
  featureFlag: 'agent_scale_pilot',
  killSwitchVerified: true,
  rollbackTargetMinutes: 15,
}

const ready = evaluateAgentPhase7Pilot({ config, phase6, deployment, source, pilot, now })
assert.equal(ready.status, 'READY_FOR_PILOT')
assert.deepEqual(ready.blockers, [])
assert.match(ready.evidenceDigest, /^[0-9a-f]{64}$/)
assert.match(ready.authorization, /does not deploy/)

const unsafe = evaluateAgentPhase7Pilot({
  config,
  phase6: { ...phase6, status: 'HOLD' },
  deployment: { ...deployment, status: 'FAIL', origin: 'http://localhost:4173' },
  source: { ...source, clean: false },
  pilot: { organisationId: '', owner: '', changeReference: '', rollbackOwner: '' },
  now,
})
assert.equal(unsafe.status, 'HOLD')
for (const expected of ['Phase 6 readiness', 'Deployment validation', 'HTTPS', 'local host', 'not clean', 'Pilot organisation', 'pilot owner', 'change reference', 'rollback owner']) {
  assert.ok(unsafe.blockers.some((blocker) => blocker.includes(expected)), `Expected blocker containing: ${expected}`)
}

const stale = evaluateAgentPhase7Pilot({ config, phase6: { ...phase6, evaluatedAt: '2026-09-01T00:00:00.000Z' }, deployment, source, pilot, now })
assert.equal(stale.status, 'HOLD')

const validator = readFileSync('scripts/validate-agent-production-phase5.mjs', 'utf8')
assert.match(validator, /--output=/, 'Deployment validation must support a durable evidence report.')

console.log('Agent Phase 7 controlled-pilot boundary checks passed.')
