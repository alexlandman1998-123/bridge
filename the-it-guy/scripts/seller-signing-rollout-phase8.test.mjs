import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')
const plan = JSON.parse(read('config/seller-signing-phase8-rollout-plan.json'))
const packageJson = JSON.parse(read('package.json'))

assert.equal(plan.contract, 'arch9-seller-signing-phase8-rollout-v1')
assert.equal(plan.status, 'hold_for_named_pilot')
assert.equal(plan.rollout.globalEnablement, false)
assert.equal(plan.rollout.requiresNamedAgency, true)
assert.equal(plan.rollout.requiresHumanApproval, true)
assert.equal(plan.rollout.productionMigrationApplied, false)
assert.equal(plan.rollout.productionFunctionDeployed, false)
assert.deepEqual(plan.rollout.pilotAgencyOrganisationIds, [])
assert.ok(plan.requiredScenarios.some((scenario) => scenario.includes('multiple signers')))
assert.ok(plan.requiredScenarios.some((scenario) => scenario.includes('amendment after')))
assert.ok(plan.requiredScenarios.some((scenario) => scenario.includes('audit export')))
for (const script of [
  'test:seller-signing-fica-correction-phase4',
  'test:seller-signing-agent-audit-phase5',
  'test:seller-signing-signed-amendment-phase6',
  'test:seller-signing-audit-export-phase7',
]) assert.ok(packageJson.scripts[script], `${script} must remain part of the rollout baseline`)

console.log('Seller signing Phase 8 controlled-rollout gate passed: HOLD for named pilot.')
