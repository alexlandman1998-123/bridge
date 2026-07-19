import assert from 'node:assert/strict'
import { evaluateMvpOnboardingGate } from '../mvpOnboardingGate.js'
assert.equal(evaluateMvpOnboardingGate({ participants: [{ role_type: 'buyer' }, { role_type: 'seller' }], documentRequirements: [{ document_key: 'id', required_from_role: 'buyer', status: 'verified' }] }).satisfied, true)
assert.equal(evaluateMvpOnboardingGate({ participants: [{ role_type: 'buyer' }], documentRequirements: [{ document_key: 'id', required_from_role: 'buyer', status: 'pending' }] }).blockers.length, 2)
console.log('mvp onboarding gate tests passed')
