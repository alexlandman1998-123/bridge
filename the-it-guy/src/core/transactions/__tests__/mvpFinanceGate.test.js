import assert from 'node:assert/strict'
import { evaluateMvpFinanceGate } from '../mvpFinanceGate.js'
assert.equal(evaluateMvpFinanceGate({ routingProfile: { financeType: 'cash' }, documentRequirements: [{ document_key: 'proof_of_funds', status: 'verified' }] }).satisfied, true)
assert.equal(evaluateMvpFinanceGate({ routingProfile: { financeType: 'hybrid' }, participants: [{ role_type: 'bond_originator' }], documentRequirements: [{ document_key: 'proof_of_funds', status: 'verified' }, { document_key: 'bond_preapproval', status: 'approved' }] }).satisfied, true)
assert.equal(evaluateMvpFinanceGate({ routingProfile: { financeType: 'bond' }, documentRequirements: [{ document_key: 'bond_preapproval', status: 'pending' }] }).blockers.length, 2)
console.log('mvp finance gate tests passed')
