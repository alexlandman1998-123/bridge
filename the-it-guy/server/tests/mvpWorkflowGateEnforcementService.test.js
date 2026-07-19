import assert from 'node:assert/strict'
import { collectMvpStageTransitionBlockers } from '../services/mvpWorkflowGateEnforcementService.js'

function buildClient(tables) {
  return {
    from(table) {
      return {
        select() { return this },
        eq() { return this },
        then(resolve) { return Promise.resolve({ data: tables[table] || [], error: null }).then(resolve) },
      }
    },
  }
}

const routingProfile = {
  transactionType: 'private_sale',
  financeType: 'bond',
  propertyTenure: 'freehold',
  buyerEntityType: 'company',
  sellerEntityType: 'individual',
  launchScope: { supported: true },
}
const transaction = { id: 'tx-mvp-1', routing_profile_json: routingProfile }
const tables = {
  transaction_participants: [
    { transaction_role: 'buyer', status: 'captured' },
    { transaction_role: 'seller', status: 'captured' },
  ],
  transaction_required_documents: [
    { document_key: 'proof_of_funds', status: 'pending', is_required: false },
    { document_key: 'bond_preapproval', status: 'pending', is_required: true },
  ],
}

const client = buildClient(tables)
const otpBlocked = await collectMvpStageTransitionBlockers({
  transactionId: transaction.id,
  actionKey: 'MOVE_TO_FINANCE',
  transaction,
  client,
})
assert.equal(otpBlocked.length > 0, true)
assert.equal(otpBlocked.some((blocker) => blocker.gateKey === 'otp_ready_to_execute'), true)

tables.transaction_participants.push({ transaction_role: 'buyer_company_signatory', status: 'captured' })
const otpReady = await collectMvpStageTransitionBlockers({
  transactionId: transaction.id,
  actionKey: 'MOVE_TO_FINANCE',
  transaction,
  client,
})
assert.deepEqual(otpReady, [])

const financeBlocked = await collectMvpStageTransitionBlockers({
  transactionId: transaction.id,
  actionKey: 'MOVE_TO_TRANSFER',
  transaction,
  client,
})
assert.equal(financeBlocked.length, 2)
assert.equal(financeBlocked.every((blocker) => blocker.gateKey === 'finance_ready'), true)

tables.transaction_participants.push({ transaction_role: 'bond_originator', status: 'captured' })
tables.transaction_required_documents[1].status = 'verified'
const financeReady = await collectMvpStageTransitionBlockers({
  transactionId: transaction.id,
  actionKey: 'MOVE_TO_TRANSFER',
  transaction,
  client,
})
assert.deepEqual(financeReady, [])

const transferBlocked = await collectMvpStageTransitionBlockers({
  transactionId: transaction.id,
  actionKey: 'MARK_READY_FOR_REGISTRATION',
  transaction,
  client,
})
assert.equal(transferBlocked.some((blocker) => blocker.gateKey === 'transfer_ready'), true)

tables.transaction_participants.push({ transaction_role: 'transfer_attorney', status: 'captured' })
const transferReady = await collectMvpStageTransitionBlockers({
  transactionId: transaction.id,
  actionKey: 'MARK_READY_FOR_REGISTRATION',
  transaction,
  client,
})
assert.deepEqual(transferReady, [])

console.log('MVP server workflow gate enforcement tests passed.')
