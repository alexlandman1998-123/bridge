import assert from 'node:assert/strict'
import {
  normalizeRoutingTransactionType,
  normalizeStoredTransactionType,
  resolveTransactionSaleProfile,
} from '../transactionSaleProfile.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('normalizes legacy development transaction names to stored developer_sale', () => {
  assert.equal(normalizeStoredTransactionType('development_sale'), 'developer_sale')
  assert.equal(normalizeStoredTransactionType('new-development'), 'developer_sale')
  assert.equal(normalizeRoutingTransactionType('developer_sale'), 'development_sale')
})

test('keeps private property explicit even when legacy development context is present', () => {
  const profile = resolveTransactionSaleProfile({
    transaction: {
      transaction_type: 'private_property',
      development_id: 'legacy-dev-id',
    },
  })

  assert.equal(profile.transactionType, 'private_property')
  assert.equal(profile.sellerPartyType, 'private_seller')
  assert.equal(profile.saleChannel, null)
})

test('resolves developer direct sale profile', () => {
  const profile = resolveTransactionSaleProfile({
    setup: {
      transactionType: 'developer_sale',
      developmentId: 'dev-1',
      unitId: 'unit-1',
    },
  })

  assert.equal(profile.transactionType, 'developer_sale')
  assert.equal(profile.routingTransactionType, 'development_sale')
  assert.equal(profile.saleChannel, 'developer_direct')
  assert.equal(profile.sellerPartyType, 'developer')
  assert.equal(profile.isDeveloperDirectSale, true)
})

test('resolves developer sale from seller party metadata when legacy transaction type is missing', () => {
  const profile = resolveTransactionSaleProfile({
    transaction: {
      seller_party_type: 'developer',
      sale_channel: 'developer_assigned',
    },
  })

  assert.equal(profile.transactionType, 'developer_sale')
  assert.equal(profile.saleChannel, 'developer_assigned')
  assert.equal(profile.sellerPartyType, 'developer')
})

test('resolves developer assigned sale from assigned agent context', () => {
  const profile = resolveTransactionSaleProfile({
    setup: {
      transactionType: 'developer_sale',
      developmentId: 'dev-1',
      unitId: 'unit-1',
      assignedAgentId: 'agent-1',
    },
  })

  assert.equal(profile.saleChannel, 'developer_assigned')
  assert.equal(profile.isDeveloperAssignedSale, true)
})

test('resolves developer assigned sale from legacy assigned agent transaction fields', () => {
  const profile = resolveTransactionSaleProfile({
    transaction: {
      transaction_type: 'developer_sale',
      development_id: 'dev-1',
      unit_id: 'unit-1',
      assigned_agent: 'Sam Agent',
    },
  })

  assert.equal(profile.saleChannel, 'developer_assigned')
  assert.equal(profile.isDeveloperAssignedSale, true)
})

test('resolves agency introduced sale from source agency context', () => {
  const profile = resolveTransactionSaleProfile({
    setup: {
      transactionType: 'developer_sale',
      developmentId: 'dev-1',
      unitId: 'unit-1',
    },
    sourceContext: {
      sourceAgencyOrgId: 'agency-1',
    },
  })

  assert.equal(profile.saleChannel, 'agency_introduced')
  assert.equal(profile.isAgencyIntroducedSale, true)
})
