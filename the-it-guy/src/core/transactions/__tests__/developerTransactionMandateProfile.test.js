import assert from 'node:assert/strict'
import {
  buildDeveloperAgentMandatePacketContext,
  buildDeveloperTransactionMandateProfile,
} from '../developerTransactionMandateProfile.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('developer sale direct transaction blocks private seller mandate assumptions', () => {
  const profile = buildDeveloperTransactionMandateProfile({
    transaction: { transaction_type: 'developer_sale' },
    unit: { development: { name: 'Junoah Estate' } },
    buyer: { name: 'Client Buyer' },
  })

  assert.equal(profile.transactionType, 'developer_sale')
  assert.equal(profile.privateSellerMandateRequired, false)
  assert.equal(profile.developerAgentMandateRequired, false)
  assert.equal(profile.mandateType, 'developer_direct_sale_record')
  assert.equal(profile.readyForMandate, true)
  assert.equal(profile.documentWorkspaceContext.blockPrivateSellerMandate, true)
  assert.deepEqual(profile.requiredSigners, [])
})

test('developer sale with selling agent requires developer-agent mandate signers', () => {
  const profile = buildDeveloperTransactionMandateProfile({
    transaction: {
      transaction_type: 'developer_sale',
      assigned_agent: 'Maya Agent',
      assigned_agent_email: 'maya@example.test',
    },
    unit: { development: { name: 'Junoah Estate' } },
    buyer: { name: 'Client Buyer' },
  })

  assert.equal(profile.developerAgentMandateRequired, true)
  assert.equal(profile.mandateType, 'developer_agent_mandate')
  assert.equal(profile.mandateLabel, 'Developer-agent mandate')
  assert.equal(profile.readyForMandate, true)
  assert.deepEqual(
    profile.requiredSigners.map((signer) => [signer.role, signer.label, signer.signerName]),
    [
      ['developer_contact', 'Developer', 'Junoah Estate'],
      ['agent', 'Selling Agent', 'Maya Agent'],
    ],
  )
})

test('developer-agent mandate reports missing signer readiness', () => {
  const profile = buildDeveloperTransactionMandateProfile({
    transaction: {
      transaction_type: 'developer_sale',
      assigned_agent_email: 'agent@example.test',
    },
    buyer: { name: 'Client Buyer' },
  })

  assert.equal(profile.developerAgentMandateRequired, true)
  assert.equal(profile.readyForMandate, false)
  assert.deepEqual(profile.missingSignerRoles.map((signer) => signer.role), ['developer_contact', 'agent'])
})

test('private property keeps seller mandate flow', () => {
  const profile = buildDeveloperTransactionMandateProfile({
    transaction: { transaction_type: 'private_property' },
  })

  assert.equal(profile.transactionType, 'private_property')
  assert.equal(profile.privateSellerMandateRequired, true)
  assert.equal(profile.developerAgentMandateRequired, false)
  assert.equal(profile.documentWorkspaceContext.blockPrivateSellerMandate, false)
})

test('developer-agent mandate packet context maps developer and selling agent into signing defaults', () => {
  const profile = buildDeveloperTransactionMandateProfile({
    transaction: {
      id: 'tx-1',
      transaction_type: 'developer_sale',
      assigned_agent: 'Maya Agent',
      assigned_agent_email: 'maya@example.test',
    },
    unit: { id: 'unit-1', development_id: 'dev-1', unit_number: '006', development: { name: 'Junoah Estate' } },
    buyer: { name: 'Client Buyer' },
  })
  const context = buildDeveloperAgentMandatePacketContext({
    mandateProfile: profile,
    transaction: {
      id: 'tx-1',
      transaction_type: 'developer_sale',
      assigned_agent: 'Maya Agent',
      assigned_agent_email: 'maya@example.test',
    },
    unit: { id: 'unit-1', development_id: 'dev-1', unit_number: '006', development: { name: 'Junoah Estate' } },
    buyer: { name: 'Client Buyer' },
  })

  assert.equal(context.mandateType, 'developer_agent_mandate')
  assert.equal(context.blockPrivateSellerMandate, true)
  assert.equal(context.generatedDataSnapshot.placeholders.seller_full_name, 'Junoah Estate')
  assert.equal(context.generatedDataSnapshot.placeholders.agent_full_name, 'Maya Agent')
  assert.equal(context.generatedDataSnapshot.lead.sellerFullName, 'Junoah Estate')
  assert.equal(context.agent.email, 'maya@example.test')
})
