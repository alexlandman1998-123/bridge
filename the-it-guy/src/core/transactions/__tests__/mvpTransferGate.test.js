import assert from 'node:assert/strict'
import { evaluateMvpTransferGate } from '../mvpTransferGate.js'
const base = { routingProfile: { financeType: 'cash' }, participants: [{ role_type: 'attorney', legal_role: 'transfer' }], documentRequirements: [{ document_key: 'proof_of_funds', status: 'verified' }, { document_key: 'title_deed', status: 'approved' }] }
assert.equal(evaluateMvpTransferGate(base).satisfied, true)
assert.equal(evaluateMvpTransferGate({ ...base, participants: [] }).satisfied, false)
console.log('mvp transfer gate tests passed')
