import assert from 'node:assert/strict'
import { buildMvpParticipantRoster } from '../src/core/transactions/mvpParticipantRoster.js'

const roster = buildMvpParticipantRoster({
  requirements: [
    { roleKey: 'buyer', roleType: 'buyer', legalRole: 'none', transactionRole: 'buyer', requiredAtCreation: true, label: 'Buyer' },
    { roleKey: 'seller', roleType: 'seller', legalRole: 'none', transactionRole: 'seller', requiredAtCreation: true, label: 'Seller' },
    { roleKey: 'agent', roleType: 'agent', legalRole: 'none', transactionRole: 'agent', requiredAtCreation: true, label: 'Agent' },
    { roleKey: 'transfer_attorney', roleType: 'attorney', legalRole: 'transfer', transactionRole: 'transfer_attorney', requiredBy: 'transfer_ready', label: 'Transfer Attorney' },
    { roleKey: 'bond_originator', roleType: 'bond_originator', legalRole: 'none', transactionRole: 'bond_originator', requiredBy: 'finance_ready', label: 'Bond Originator' },
  ],
  participants: [
    { id: 'buyer-1', roleType: 'buyer', legalRole: 'none', transactionRole: 'buyer', participantName: 'Buyer', participantEmail: 'buyer@example.test' },
    { id: 'seller-1', roleType: 'seller', legalRole: 'none', transactionRole: 'seller', participantName: 'Seller', participantEmail: 'seller@example.test' },
    { id: 'agent-1', roleType: 'agent', legalRole: 'none', transactionRole: 'listing_agent', participantName: 'Agent', userId: 'agent-user-1' },
  ],
})

assert.equal(roster.summary.required, 5)
assert.equal(roster.summary.assigned, 3)
assert.equal(roster.summary.missingAtCreation, 0)
assert.deepEqual(roster.nextGateRequirements.map((item) => item.roleKey), ['transfer_attorney', 'bond_originator'])

const missingCreationRole = buildMvpParticipantRoster({
  requirements: [{ roleKey: 'buyer', roleType: 'buyer', requiredAtCreation: true, label: 'Buyer' }],
  participants: [{ roleType: 'buyer', participantName: 'Buyer pending' }],
})
assert.equal(missingCreationRole.creationBlockers.length, 1)

const linkedRole = buildMvpParticipantRoster({
  requirements: [{ participantId: 'transfer-1', roleKey: 'transfer_attorney', roleType: 'attorney', legalRole: 'transfer', label: 'Transfer Attorney' }],
  participants: [{ id: 'transfer-1', roleType: 'attorney', legalRole: 'transfer', participantName: 'Transfer Attorney', participantEmail: 'test.transfer.attorney@arch9.invalid' }],
})
assert.equal(linkedRole.roles[0].assigned, true)
assert.equal(linkedRole.roles[0].contactReady, true)
console.log('mvp-participant-roster: passed')
