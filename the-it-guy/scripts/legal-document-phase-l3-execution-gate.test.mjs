import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildLegalDocumentLaunchRemediationPlan } from '../src/core/documents/legalDocumentLaunchRemediationPlan.js'
import { buildLegalDocumentRemediationExecutionGate } from '../src/core/documents/legalDocumentRemediationExecutionGate.js'

const l2 = buildLegalDocumentLaunchRemediationPlan({ status: 'NO_GO', blockers: [
  { domain: 'activation', code: 'A3_NOT_ACTIVE', solution: 'Activate it.' },
  { domain: 'approval', code: 'B1_TEMPLATE_SOURCE_UNREADABLE', solution: 'Restore it.' },
  { domain: 'approval', code: 'B2_COUNSEL_REVIEW_PENDING', solution: 'Approve it.' },
  { domain: 'capacity', code: 'I3_I2_NOT_READY', solution: 'Qualify it.' },
  { domain: 'coverage', code: 'L1_OTP_JOURNEY_UNPROVEN', solution: 'Complete OTP.' },
  { domain: 'coverage', code: 'L1_MANDATE_JOURNEY_UNPROVEN', solution: 'Complete mandate.' },
] })
const gate = buildLegalDocumentRemediationExecutionGate(l2)
assert.equal(gate.status, 'EXECUTION_WAVE_READY')
assert.equal(gate.currentWave, 1)
assert.deepEqual(gate.readyActionIds, ['platform_targeting'])
assert.equal(gate.nextActions[0].authorizationRequired, true)
assert.equal(gate.nextActions[0].advanceCondition, l2.actions[0].acceptance)
assert.ok(gate.heldActionIds.includes('governed_source'))
assert.deepEqual(gate.actionStates.find((row) => row.id === 'governed_source').unresolvedDependencies, ['platform_targeting'])

const parallelPlan = buildLegalDocumentLaunchRemediationPlan({ status: 'NO_GO', blockers: [
  { code: 'L1_OTP_JOURNEY_UNPROVEN', solution: 'Complete OTP.' },
  { code: 'L1_MANDATE_JOURNEY_UNPROVEN', solution: 'Complete mandate.' },
] })
const parallelGate = buildLegalDocumentRemediationExecutionGate(parallelPlan)
assert.equal(parallelGate.currentWave, 5)
assert.deepEqual(parallelGate.readyActionIds.sort(), ['controlled_mandate', 'controlled_otp'])
assert.ok(parallelGate.actionStates.find((row) => row.id === 'launch_recertification').unresolvedDependencies.includes('controlled_otp'))

const ready = buildLegalDocumentRemediationExecutionGate(buildLegalDocumentLaunchRemediationPlan({ status: 'READY_FOR_L2', blockers: [] }))
assert.equal(ready.status, 'READY_FOR_L4')
assert.equal(ready.gateComplete, true)

const incomplete = buildLegalDocumentRemediationExecutionGate({ planComplete: false, actions: [{ id: 'x', wave: 1, dependsOn: [] }] })
assert.equal(incomplete.status, 'EXECUTION_BLOCKED')
assert.equal(incomplete.blockers[0].code, 'L3_PLAN_INCOMPLETE')

const cyclic = buildLegalDocumentRemediationExecutionGate({ planComplete: true, actions: [{ id: 'a', wave: 1, dependsOn: ['b'] }, { id: 'b', wave: 1, dependsOn: ['a'] }] })
assert.equal(cyclic.status, 'EXECUTION_BLOCKED')
assert.equal(cyclic.blockers[0].code, 'L3_DEPENDENCY_CYCLE')

const verifier = fs.readFileSync('scripts/legal-document-phase-l3-execution-gate.mjs', 'utf8')
assert.match(verifier, /legal-document-phase-l2-remediation-plan\.mjs/)
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-l3', 'verify:legal-documents:phase-l3']) assert.ok(pkg.scripts?.[name])
console.log('Legal document L3 remediation execution gate passed.')
