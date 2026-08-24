import assert from 'node:assert/strict'
import {
  getTransactionSalePartyModel,
  getTransactionSaleRouteBadge,
  normalizeTransactionSaleRoute,
  normalizeRoutingTransactionType,
  normalizeStoredTransactionType,
  resolveTransactionSaleRoute,
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
  assert.equal(normalizeTransactionSaleRoute('developer_direct'), 'internal_developer_sale')
  assert.equal(normalizeTransactionSaleRoute('agency-introduced'), 'external_agency_sale')
})

test('provides display badges for canonical sale routes', () => {
  assert.deepEqual(getTransactionSaleRouteBadge('internal_developer_sale'), {
    saleRoute: 'internal_developer_sale',
    label: 'Internal Developer Sale',
    tone: 'emerald',
  })
  assert.deepEqual(getTransactionSaleRouteBadge('developer_assigned_sale'), {
    saleRoute: 'developer_assigned_sale',
    label: 'Developer Assigned Sale',
    tone: 'blue',
  })
  assert.deepEqual(getTransactionSaleRouteBadge('external_agency_sale'), {
    saleRoute: 'external_agency_sale',
    label: 'External Agency Sale',
    tone: 'amber',
  })
  assert.deepEqual(getTransactionSaleRouteBadge('private_property_sale'), {
    saleRoute: 'private_property_sale',
    label: 'Private Property Sale',
    tone: 'slate',
  })
})

test('provides canonical party labels for private and developer sale routes', () => {
  const privateModel = getTransactionSalePartyModel('private_property_sale')
  assert.equal(privateModel.seller.key, 'seller')
  assert.equal(privateModel.seller.label, 'Seller')
  assert.equal(privateModel.seller.documentsLabel, 'Seller Documents')
  assert.equal(privateModel.agency.visible, false)

  const internalDeveloperModel = getTransactionSalePartyModel('internal_developer_sale')
  assert.equal(internalDeveloperModel.seller.key, 'developer')
  assert.equal(internalDeveloperModel.seller.label, 'Developer')
  assert.equal(internalDeveloperModel.seller.documentsLabel, 'Developer Documents')
  assert.equal(internalDeveloperModel.agency.visible, false)

  const externalAgencyModel = getTransactionSalePartyModel('external_agency_sale')
  assert.equal(externalAgencyModel.seller.key, 'developer')
  assert.equal(externalAgencyModel.seller.label, 'Developer')
  assert.equal(externalAgencyModel.agency.visible, true)
  assert.equal(externalAgencyModel.agency.label, 'Agency / Introducing Agent')
  assert.equal(externalAgencyModel.agent.label, 'Internal Sales Agent')
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
  assert.equal(profile.saleRoute, 'internal_developer_sale')
  assert.equal(profile.saleChannel, 'developer_direct')
  assert.equal(profile.sellerPartyType, 'developer')
  assert.equal(profile.isInternalDeveloperSale, true)
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
  assert.equal(profile.saleRoute, 'developer_assigned_sale')
  assert.equal(profile.saleChannel, 'developer_assigned')
  assert.equal(profile.sellerPartyType, 'developer')
})

test('resolves internal developer sale from developer-owned direct model without external agency', () => {
  const profile = resolveTransactionSaleProfile({
    transaction: {
      transaction_type: 'development_sale',
    },
    sourceContext: {
      leadOwner: 'developer',
      ownershipModel: 'developer_direct',
    },
  })

  assert.equal(resolveTransactionSaleRoute({
    transaction: { transaction_type: 'development_sale' },
    sourceContext: { leadOwner: 'developer', ownershipModel: 'developer_direct' },
  }), 'internal_developer_sale')
  assert.equal(profile.transactionType, 'developer_sale')
  assert.equal(profile.saleRoute, 'internal_developer_sale')
  assert.equal(profile.saleChannel, 'developer_direct')
  assert.equal(profile.isInternalDeveloperSale, true)
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
  assert.equal(profile.saleRoute, 'developer_assigned_sale')
  assert.equal(profile.isDeveloperAssignedRoute, true)
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
  assert.equal(profile.saleRoute, 'developer_assigned_sale')
  assert.equal(profile.isDeveloperAssignedSale, true)
})

test('resolves external agency sale from source agency context', () => {
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

  assert.equal(profile.saleRoute, 'external_agency_sale')
  assert.equal(profile.saleChannel, 'agency_introduced')
  assert.equal(profile.isExternalAgencySale, true)
  assert.equal(profile.isAgencyIntroducedSale, true)
})

test('resolves external agency sale from transaction row agency fields', () => {
  const profile = resolveTransactionSaleProfile({
    transaction: {
      transaction_type: 'development_sale',
      development_id: 'dev-1',
      lead_owner: 'agency',
      ownership_model: 'agency_introduced',
      source_agency_org_id: 'agency-1',
    },
  })

  assert.equal(profile.saleRoute, 'external_agency_sale')
  assert.equal(profile.saleChannel, 'agency_introduced')
  assert.equal(profile.isExternalAgencySale, true)
})

test('resolves external agency sale from explicit sale route even when legacy transaction type is missing', () => {
  const profile = resolveTransactionSaleProfile({
    transaction: {
      sale_route: 'external_agency_sale',
    },
  })

  assert.equal(profile.transactionType, 'developer_sale')
  assert.equal(profile.saleRoute, 'external_agency_sale')
  assert.equal(profile.saleChannel, 'agency_introduced')
  assert.equal(profile.sellerPartyType, 'developer')
})
