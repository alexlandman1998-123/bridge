import assert from 'node:assert/strict'
import { buildMvpWorkflowGateBoard } from '../src/core/transactions/mvpWorkflowGateBoard.js'

const common = {
  routingProfile: { financeType: 'hybrid' },
  participants: [
    { role_type: 'buyer', transaction_role: 'buyer', status: 'active' },
    { role_type: 'seller', transaction_role: 'seller', status: 'active' },
    { role_type: 'agent', transaction_role: 'listing_agent', status: 'active' },
    { role_type: 'attorney', legal_role: 'transfer', transaction_role: 'transfer_attorney', status: 'active' },
  ],
  documentRequirements: [
    { document_key: 'buyer_identity', required_from_role: 'buyer', status: 'verified' },
    { document_key: 'seller_identity', required_from_role: 'seller', status: 'verified' },
    { document_key: 'proof_of_funds', required_from_role: 'buyer', status: 'verified' },
    { document_key: 'bond_preapproval', required_from_role: 'bond_originator', status: 'approved' },
  ],
  workflowLanes: [
    { laneKey: 'main', status: 'active' },
    { laneKey: 'finance', status: 'pending' },
    { laneKey: 'transfer', status: 'pending' },
    { laneKey: 'bond', status: 'pending' },
  ],
}

const blocked = buildMvpWorkflowGateBoard(common)
assert.equal(blocked.gates.find((gate) => gate.key === 'onboarding').satisfied, true)
assert.equal(blocked.gates.find((gate) => gate.key === 'finance').satisfied, false)
assert.match(blocked.gates.find((gate) => gate.key === 'finance').blockers[0].key, /bond_originator/)
assert.equal(blocked.lanes.find((lane) => lane.laneKey === 'finance').canProgress, false)
assert.equal(blocked.lanes.find((lane) => lane.laneKey === 'bond').gateKey, 'transfer')

const ready = buildMvpWorkflowGateBoard({
  ...common,
  participants: [
    ...common.participants,
    { role_type: 'bond_originator', transaction_role: 'bond_originator', status: 'active' },
    { role_type: 'attorney', legal_role: 'bond', transaction_role: 'bond_attorney', status: 'active' },
  ],
})
assert.ok(ready.gates.every((gate) => gate.satisfied))
assert.ok(ready.lanes.every((lane) => lane.canProgress))
console.log('mvp-workflow-gates: passed')
