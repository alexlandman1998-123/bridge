import assert from 'node:assert/strict'
import {
  applyMatterDocumentMetadata,
  resolveMatterDocumentMetadata,
} from '../matterDocumentMetadata.js'

const bondGrant = resolveMatterDocumentMetadata({
  document_key: 'bond_grant',
  document_label: 'Bond Grant',
})

assert.equal(bondGrant.groupKey, 'finance')
assert.equal(bondGrant.requiredFromRole, 'bond_originator')
assert.equal(bondGrant.visibilityScope, 'client')
assert.equal(bondGrant.attorneyCategory, 'Guarantees')
assert.equal(bondGrant.libraryCategory, 'bond')
assert.equal(bondGrant.collectionGroupKey, 'buyer')
assert.equal(bondGrant.collectionBucketKey, 'finance')
assert.equal(bondGrant.financeLane, 'bond')

const grantLetter = resolveMatterDocumentMetadata({
  label: 'Grant letter from bank',
  requiredFromRole: 'client',
  groupKey: 'buyer_fica',
})

assert.equal(grantLetter.groupKey, 'finance')
assert.equal(grantLetter.requiredFromRole, 'bond_originator')
assert.equal(grantLetter.collectionGroupKey, 'buyer')
assert.ok(grantLetter.confidence >= 0.86)

const guarantee = applyMatterDocumentMetadata({
  key: 'purchase_price_guarantee',
  label: 'Purchase price guarantee',
  requiredFromRole: 'attorney',
  groupKey: 'transfer',
})

assert.equal(guarantee.groupKey, 'finance')
assert.equal(guarantee.expectedFromRole, 'bond_originator')
assert.equal(guarantee.defaultVisibility, 'shared')

const sellerProperty = resolveMatterDocumentMetadata({
  label: 'Seller title deed',
})

assert.equal(sellerProperty.collectionGroupKey, 'seller')
assert.equal(sellerProperty.collectionBucketKey, 'property')

const unknown = resolveMatterDocumentMetadata({
  label: 'Random internal memo',
})

assert.equal(unknown.confidence, 0)

console.log('matter document metadata tests passed')
