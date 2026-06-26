import assert from 'node:assert/strict'
import {
  buildTransactionWorkspaceMenuItems,
  isDeveloperSaleTransaction,
  resolveTransactionWorkspaceMenuAlias,
  resolveTransactionWorkspaceProfile,
} from '../transactionWorkspaceProfile.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('developer sale is detected from explicit transaction type', () => {
  assert.equal(isDeveloperSaleTransaction({ transaction_type: 'developer_sale' }), true)
  assert.equal(isDeveloperSaleTransaction({ transaction_type: 'private_property', development_id: 'dev-1' }), false)
})

test('developer sale is detected from linked development context', () => {
  assert.equal(isDeveloperSaleTransaction({}, { development_id: 'dev-1' }), true)
  assert.equal(isDeveloperSaleTransaction({ developmentId: 'dev-1' }), true)
})

test('developer sale profile uses developer-buyer relationship labels', () => {
  const profile = resolveTransactionWorkspaceProfile({
    transaction: { transaction_type: 'developer_sale' },
    workspaceRole: 'developer',
  })

  assert.equal(profile.key, 'developer_sale')
  assert.equal(profile.relationshipMode, 'developer_buyer')
  assert.equal(profile.features.hasPrivateSeller, false)
  assert.equal(profile.labels.seller, 'Developer')
  assert.equal(profile.labels.onboardingTab, 'Buyer / Purchaser')
})

test('private property profile preserves seller-buyer relationship labels', () => {
  const profile = resolveTransactionWorkspaceProfile({
    transaction: { transaction_type: 'private_property' },
    unit: { development_id: 'ignored-because-explicit-private-wins' },
  })

  assert.equal(profile.key, 'private_property')
  assert.equal(profile.relationshipMode, 'seller_buyer')
  assert.equal(profile.features.hasPrivateSeller, true)
  assert.equal(profile.labels.seller, 'Seller')
})

test('agent developer sale menus use reservation finance label and legacy aliases', () => {
  const profile = resolveTransactionWorkspaceProfile({
    transaction: { transaction_type: 'developer_sale' },
    workspaceRole: 'agent',
  })
  const menus = buildTransactionWorkspaceMenuItems(profile, {
    isAgentWorkspace: true,
    documentsCount: 4,
    financeMeta: 'bond',
    handoverMeta: 'In Progress',
    taskCount: 2,
    activityCount: 3,
    alterationEnabled: true,
    snagEnabled: true,
  })

  assert.equal(resolveTransactionWorkspaceMenuAlias(profile, 'bond'), 'financials')
  assert.equal(resolveTransactionWorkspaceMenuAlias(profile, 'cancellation'), 'transfer')
  assert.equal(menus.find((item) => item.id === 'financials')?.label, 'Reservation & Finance')
  assert.equal(menus.find((item) => item.id === 'onboarding')?.label, 'Buyer / Purchaser')
  assert.equal(menus.find((item) => item.id === 'handover')?.meta, 'In Progress')
  assert.ok(menus.some((item) => item.id === 'snags'))
})

test('private property menus do not expose developer-only modules', () => {
  const profile = resolveTransactionWorkspaceProfile({
    transaction: { transaction_type: 'private_property' },
    workspaceRole: 'developer',
  })
  const menus = buildTransactionWorkspaceMenuItems(profile, {
    alterationEnabled: true,
    snagEnabled: true,
  })

  assert.equal(menus.some((item) => item.id === 'alterations'), false)
  assert.equal(menus.some((item) => item.id === 'handover'), false)
  assert.equal(menus.some((item) => item.id === 'snags'), false)
})
