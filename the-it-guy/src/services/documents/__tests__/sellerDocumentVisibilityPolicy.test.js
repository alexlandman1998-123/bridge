import assert from 'node:assert/strict'
import test from 'node:test'
import {
  filterSellerPortalDocuments,
  filterSellerPortalRequirements,
  isSellerPortalVisibleDocument,
  resolveSellerDocumentAudienceAccess,
} from '../sellerDocumentVisibilityPolicy.js'

test('seller portal visibility is fail-closed for sensitive and role-player documents', () => {
  for (const visibility of ['internal', 'internal_only', 'agent_only', 'manager_only', 'compliance_only']) {
    assert.equal(isSellerPortalVisibleDocument({ visibility }), false, visibility)
  }
  for (const visibility of ['shared_role_players', 'role_player_only', 'professional_shared']) {
    assert.equal(isSellerPortalVisibleDocument({ visibility }), false, visibility)
  }
  for (const visibility of ['seller_visible', 'client_visible', 'client']) {
    assert.equal(isSellerPortalVisibleDocument({ visibility }), true, visibility)
  }
  assert.equal(isSellerPortalVisibleDocument({}), false)
  assert.equal(isSellerPortalVisibleDocument({ visibility: 'unknown_future_scope' }, {
    requirement: { applies_to: 'seller' },
  }), false)
  assert.equal(isSellerPortalVisibleDocument({ visibility: 'internal_only', clientVisible: true }), false)
})

test('legacy uploads are released only through a seller-visible linked requirement', () => {
  const requirements = [
    { id: 'seller-id', key: 'identity', applies_to: 'seller', visibility: 'seller_visible' },
    { id: 'internal-note', key: 'risk_note', applies_to: 'seller', visibility: 'internal_only' },
  ]
  const documents = [
    { id: 'linked-visible', requirement_id: 'seller-id' },
    { id: 'linked-internal', requirement_id: 'internal-note' },
    { id: 'unclassified' },
    { id: 'explicit-visible', visibility: 'seller_visible' },
  ]

  assert.deepEqual(
    filterSellerPortalRequirements(requirements).map((item) => item.id),
    ['seller-id'],
  )
  assert.deepEqual(
    filterSellerPortalDocuments(documents, requirements).map((item) => item.id),
    ['linked-visible', 'explicit-visible'],
  )
})

test('audience access keeps agent review broad while role-player sharing remains explicit', () => {
  const internal = { visibility: 'internal_only' }
  const shared = { visibility: 'shared_role_players' }
  const sellerVisible = { visibility: 'seller_visible' }

  assert.equal(resolveSellerDocumentAudienceAccess(internal, 'agent'), true)
  assert.equal(resolveSellerDocumentAudienceAccess(internal, 'manager'), true)
  assert.equal(resolveSellerDocumentAudienceAccess(internal, 'seller'), false)
  assert.equal(resolveSellerDocumentAudienceAccess(shared, 'role_player'), true)
  assert.equal(resolveSellerDocumentAudienceAccess(sellerVisible, 'role_player'), false)
  assert.equal(resolveSellerDocumentAudienceAccess(shared, 'seller'), false)
  assert.equal(resolveSellerDocumentAudienceAccess(sellerVisible, 'seller'), true)
})
