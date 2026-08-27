import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { buildAgentBuyerSellerRelationshipHealth } from '../src/core/transactions/agentBuyerSellerRelationshipHealth.js'

const participants = [
  { roleType: 'agent', transactionRole: 'agent', status: 'active' },
  { roleType: 'buyer', transactionRole: 'buyer_1', status: 'active' },
  { roleType: 'seller', transactionRole: 'seller_1', status: 'active' },
]

const buyerActionHealth = buildAgentBuyerSellerRelationshipHealth({
  transactionId: 'phase-6-buyer-action',
  truth: {
    nextAction: {
      ownerRole: 'buyer',
      label: 'Complete the existing bond application.',
    },
  },
  participants,
})

assert.equal(buyerActionHealth.status, 'clear')
assert.equal(buyerActionHealth.summary.connected, 3)
assert.equal(buyerActionHealth.summary.actionRequired, 1)
assert.equal(buyerActionHealth.roles.find((role) => role.role === 'buyer').state, 'action_required')
assert.equal(buyerActionHealth.roles.find((role) => role.role === 'buyer').nextAction, 'Complete the existing bond application.')
assert.equal(buyerActionHealth.roles.find((role) => role.role === 'seller').state, 'waiting')

const missingSellerHealth = buildAgentBuyerSellerRelationshipHealth({
  transactionId: 'phase-6-missing-seller',
  truth: { nextAction: { ownerRole: 'transaction_coordinator', label: 'Monitor transfer.' } },
  participants: participants.filter((participant) => participant.roleType !== 'seller'),
})

assert.equal(missingSellerHealth.status, 'attention')
assert.equal(missingSellerHealth.summary.unconfirmed, 1)
assert.equal(missingSellerHealth.roles.find((role) => role.role === 'seller').state, 'link_not_confirmed')
assert.equal(missingSellerHealth.attention[0].ownerRole, 'agent')
assert.match(missingSellerHealth.attention[0].reason, /seller is linked/i)

const handoffHealth = buildAgentBuyerSellerRelationshipHealth({
  transactionId: 'phase-6-signed-otp',
  truth: { nextAction: { ownerRole: 'transaction_team', label: 'Monitor finance handoff.' } },
  participants,
  events: [
    {
      eventType: 'signed_otp_handoff_release_decision',
      eventData: {
        roleOwnership: {
          agent: {
            state: 'monitoring',
            ownerRole: 'transaction_team',
            waitingOnRole: 'bond_originator',
            nextAction: 'Monitor the released handoff and resolve any control-board blockers.',
          },
          buyer: {
            state: 'action_required_if_requested',
            ownerRole: 'buyer',
            waitingOnRole: 'bond_originator',
            nextAction: 'Complete existing portal requirements only when requested.',
          },
          seller: {
            state: 'no_action_required',
            ownerRole: 'transaction_team',
            waitingOnRole: 'transaction_team',
            nextAction: 'Track finance and transfer progress in the seller portal.',
          },
        },
      },
    },
  ],
})

assert.equal(handoffHealth.roles.find((role) => role.role === 'agent').waitingOnRole, 'bond_originator')
assert.equal(handoffHealth.roles.find((role) => role.role === 'seller').state, 'no_action_required')
assert.equal(handoffHealth.roles.find((role) => role.role === 'seller').stateLabel, 'No action needed')

const root = process.cwd()
const [readModelSource, controlBoardSource] = await Promise.all([
  readFile(resolve(root, 'src/services/transactionWorkflowReadModelService.js'), 'utf8'),
  readFile(resolve(root, 'src/components/transaction/MvpTransactionControlBoard.jsx'), 'utf8'),
])

assert.match(readModelSource, /buildAgentBuyerSellerRelationshipHealth/)
assert.match(readModelSource, /relationshipHealth,/)
assert.match(controlBoardSource, /!compact && relationshipHealth\?\.roles\?\.length/)
assert.match(controlBoardSource, /Agent, buyer and seller responsibilities/)

console.log('Agent/buyer/seller Phase 6 relationship-health checks passed.')
