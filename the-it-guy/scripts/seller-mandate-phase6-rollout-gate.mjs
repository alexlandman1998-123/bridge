import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')
const plan = JSON.parse(read('config/seller-mandate-phase6-rollout-plan.json'))
const requiredScripts = [
  'scripts/seller-mandate-terms-phase2.test.mjs',
  'scripts/seller-mandate-primary-contact-phase3.test.mjs',
  'scripts/seller-mandate-replacement-phase4.test.mjs',
  'scripts/seller-mandate-experience-phase5.test.mjs',
]
const requiredScenarios = ['individual_seller', 'co_owner_primary_contact', 'company_authority', 'trust_authority', 'proposed_transfer_attorney', 'correction_after_one_signature', 'marketing_separation', 'audit_export']

assert.equal(plan.contract, 'arch9-seller-mandate-phase6-rollout-v1')
assert.equal(plan.rollout.globalEnablement, false)
assert.equal(plan.rollout.requiresNamedAgency, true)
assert.equal(plan.rollout.requiresHumanApproval, true)
assert.deepEqual(plan.scenarios.map((scenario) => scenario.key), requiredScenarios)
requiredScripts.forEach((path) => assert.ok(existsSync(new URL(path, root)), `Missing prerequisite check: ${path}`))

console.log(`Phase 6 rollout gate: HOLD (${plan.status})`)
console.log('A named agency, counsel-approved terms, recorded scenario evidence, audit export sample, rollback owner, and pilot approval are required before pilot activation.')
