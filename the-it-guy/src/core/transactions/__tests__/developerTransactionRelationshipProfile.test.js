import assert from 'node:assert/strict'
import {
  buildDeveloperTransactionRelationshipSummary,
  buildDeveloperTransactionRoleplayerSnapshot,
  isDeveloperTransactionRoleType,
  normalizeDeveloperTransactionRoleType,
  resolveDeveloperTransactionRelationshipProfile,
} from '../developerTransactionRelationshipProfile.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('normalizes developer transaction role aliases', () => {
  assert.equal(normalizeDeveloperTransactionRoleType('developer'), 'developer_contact')
  assert.equal(normalizeDeveloperTransactionRoleType('selling-agent'), 'agent')
  assert.equal(normalizeDeveloperTransactionRoleType('conveyancer'), 'transfer_attorney')
  assert.equal(normalizeDeveloperTransactionRoleType('bond consultant'), 'bond_originator')
})

test('recognises developer transaction role types', () => {
  assert.equal(isDeveloperTransactionRoleType('developer_rep'), true)
  assert.equal(isDeveloperTransactionRoleType('listing_agent'), true)
  assert.equal(isDeveloperTransactionRoleType('seller'), false)
})

test('developer sale relationship blocks private seller mandate assumptions', () => {
  const profile = resolveDeveloperTransactionRelationshipProfile({
    transactionType: 'developer_sale',
    roleTypes: ['developer', 'agent', 'transfer_attorney'],
  })

  assert.equal(profile.isDeveloperSale, true)
  assert.equal(profile.sellerPartyRole, 'developer_contact')
  assert.equal(profile.privateSellerMandateRequired, false)
  assert.equal(profile.developerAgentMandateRequired, true)
  assert.deepEqual(profile.absentRequiredRoleTypes, [])
  assert.ok(profile.activeRoleTypes.includes('developer_contact'))
  assert.ok(profile.activeRoleTypes.includes('agent'))
})

test('developer sale without agent does not force developer-agent mandate', () => {
  const profile = resolveDeveloperTransactionRelationshipProfile({
    transactionType: 'developer_sale',
    roleTypes: ['developer_contact'],
  })

  assert.equal(profile.developerAgentMandateRequired, false)
})

test('standard transaction keeps private seller mandate model', () => {
  const profile = resolveDeveloperTransactionRelationshipProfile({
    transactionType: 'private_property',
    roleTypes: ['agent'],
  })

  assert.equal(profile.isDeveloperSale, false)
  assert.equal(profile.sellerPartyRole, 'seller')
  assert.equal(profile.privateSellerMandateRequired, true)
})

test('roleplayer snapshot carries relationship mode and mandate flags', () => {
  const profile = resolveDeveloperTransactionRelationshipProfile({
    transactionType: 'developer_sale',
    roleTypes: ['agent'],
  })
  const snapshot = buildDeveloperTransactionRoleplayerSnapshot({ roleType: 'selling_agent' }, profile)

  assert.equal(snapshot.relationshipMode, 'developer_buyer')
  assert.equal(snapshot.roleType, 'agent')
  assert.equal(snapshot.roleLabel, 'Selling Agent')
  assert.equal(snapshot.privateSellerMandateRequired, false)
  assert.equal(snapshot.developerAgentMandateRequired, true)
})

test('relationship summary resolves developer sale parties from transaction and roleplayers', () => {
  const summary = buildDeveloperTransactionRelationshipSummary({
    transaction: {
      transaction_type: 'developer_sale',
      assigned_agent: 'Maya Agent',
      assigned_agent_email: 'maya@example.test',
      attorney: 'Transfer Co',
    },
    unit: {
      development: { name: 'Junoah Estate' },
    },
    buyer: {
      name: 'Client Buyer',
      email: 'client@example.test',
    },
    rolePlayers: [
      {
        roleType: 'bond_originator',
        partnerName: 'Bond Studio',
        emailAddress: 'bond@example.test',
      },
    ],
  })

  assert.equal(summary.summaryLabel, 'Developer sale with selling agent')
  assert.equal(summary.mandateLabel, 'Developer-agent mandate required')
  assert.equal(summary.privateSellerMandateRequired, false)
  assert.equal(summary.developerAgentMandateRequired, true)
  assert.equal(summary.rows.find((row) => row.id === 'developer_contact')?.name, 'Junoah Estate')
  assert.equal(summary.rows.find((row) => row.id === 'buyer')?.name, 'Client Buyer')
  assert.equal(summary.rows.find((row) => row.id === 'agent')?.email, 'maya@example.test')
  assert.equal(summary.rows.find((row) => row.id === 'bond_originator')?.name, 'Bond Studio')
  assert.deepEqual(summary.missingRequiredRows, [])
})

test('relationship summary identifies missing required developer party', () => {
  const summary = buildDeveloperTransactionRelationshipSummary({
    transaction: { transaction_type: 'developer_sale' },
    buyer: {},
    rolePlayers: [],
  })

  assert.equal(summary.summaryLabel, 'Developer direct sale')
  assert.equal(summary.mandateLabel, 'No private seller mandate')
  assert.deepEqual(summary.missingRequiredRows.map((row) => row.id), ['developer_contact', 'buyer'])
})
