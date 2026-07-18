import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildLegalDocumentLaunchRemediationPlan, LEGAL_DOCUMENT_L2_ACTION_CATALOG } from '../src/core/documents/legalDocumentLaunchRemediationPlan.js'

const blockers = [
  { domain: 'activation', code: 'A3_TARGET_PROJECT_REF_MISSING', solution: 'Set the project.' },
  { domain: 'approval', code: 'B1_TEMPLATE_SOURCE_UNREADABLE', solution: 'Restore the object.' },
  { domain: 'approval', code: 'B2_COUNSEL_REVIEW_PENDING', solution: 'Record counsel review.' },
  { domain: 'capacity', code: 'I3_I2_NOT_READY', solution: 'Complete I2.' },
  { domain: 'capacity', code: 'I3_CONTROLLED_TARGETS_MISSING', solution: 'Create targets.' },
  { domain: 'lifecycle', code: 'K3_K2_NOT_READY', solution: 'Complete K2.' },
  { domain: 'coverage', code: 'L1_OTP_JOURNEY_UNPROVEN', solution: 'Complete OTP.' },
  { domain: 'coverage', code: 'L1_MANDATE_JOURNEY_UNPROVEN', solution: 'Complete mandate.' },
]
const plan = buildLegalDocumentLaunchRemediationPlan({ status: 'NO_GO', blockers })
assert.equal(plan.status, 'REMEDIATION_PLAN_READY')
assert.equal(plan.planComplete, true)
assert.equal(plan.launchReady, false)
assert.equal(plan.nextAction, 'platform_targeting')
assert.equal(plan.actions.at(-1).id, 'launch_recertification')
assert.deepEqual(plan.actions.find((row) => row.id === 'counsel_approval').dependsOn, ['governed_source'])
assert.deepEqual(plan.actions.find((row) => row.id === 'support_lifecycle').dependsOn.sort(), ['controlled_mandate', 'controlled_otp'])
assert.ok(plan.actions.find((row) => row.id === 'controlled_otp').blockerCodes.includes('I3_CONTROLLED_TARGETS_MISSING'))
assert.ok(plan.actions.every((row) => row.ownerRole && row.acceptance && row.commands.length))
assert.equal(plan.unassignedBlockers.length, 0)
assert.equal(Object.keys(LEGAL_DOCUMENT_L2_ACTION_CATALOG).length, 7)

const ready = buildLegalDocumentLaunchRemediationPlan({ status: 'READY_FOR_L2', blockers: [] })
assert.equal(ready.status, 'READY_FOR_L3')
assert.equal(ready.launchReady, true)
assert.deepEqual(ready.actions, [])

const unknown = buildLegalDocumentLaunchRemediationPlan({ status: 'NO_GO', blockers: [{ code: 'FUTURE_GATE', solution: 'Fix it.' }] })
assert.equal(unknown.planComplete, true)
assert.equal(unknown.actions[0].executionMode, 'manual_remediation')
assert.ok(unknown.actions[0].blockerCodes.includes('FUTURE_GATE'))

const verifier = fs.readFileSync('scripts/legal-document-phase-l2-remediation-plan.mjs', 'utf8')
assert.match(verifier, /legal-document-phase-l1-launch-certification\.mjs/)
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-l2', 'verify:legal-documents:phase-l2']) assert.ok(pkg.scripts?.[name])
console.log('Legal document L2 remediation planning passed.')
