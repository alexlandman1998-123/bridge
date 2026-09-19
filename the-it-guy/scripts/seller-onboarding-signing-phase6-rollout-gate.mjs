import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const root = new URL('..', import.meta.url)
const plan = JSON.parse(readFileSync(new URL('config/seller-onboarding-signing-phase6-rollout.json', root), 'utf8'))
const checks = [0, 1, 2, 3, 4, 5].map((phase) => `scripts/seller-onboarding-signing-phase${phase}${phase === 6 ? '-rollout-gate' : ''}.test.mjs`)
assert.equal(plan.contract, 'arch9-seller-onboarding-signing-phase6-rollout-v1')
assert.equal(plan.globalEnablement, false)
assert.equal(plan.requiredScenarios.length, 8)
assert.match(plan.pilotRule, /separate states/)
checks.slice(0, 6).forEach((path) => assert.ok(existsSync(new URL(path, root)), `Missing prerequisite: ${path}`))
console.log(`Onboarding/signing Phase 6 rollout gate: HOLD (${plan.status})`)
console.log('A named agency pilot and all listed evidence are required; this check cannot enable the flow.')
