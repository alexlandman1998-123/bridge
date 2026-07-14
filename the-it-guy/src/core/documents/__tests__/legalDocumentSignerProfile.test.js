import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveLegalDocumentSignerProfile } from '../legalDocumentSignerProfile.js'

test('uses authorised representatives for company and trust parties', () => {
  const profile = resolveLegalDocumentSignerProfile({
    packetType: 'otp',
    placeholders: {
      buyer_entity_type: 'company',
      buyer_representative_name: 'Alex Director',
      buyer_representative_email: 'alex@buyer.example',
      seller_entity_type: 'trust',
      seller_representative_name: 'Sam Trustee',
      seller_representative_email: 'sam@seller.example',
      property_title_type: 'sectional_title',
      finance_type: 'bond',
    },
  })

  assert.deepEqual(profile.signers.map((signer) => [signer.role, signer.label]), [
    ['purchaser_1', 'Buyer representative'],
    ['seller', 'Seller representative'],
  ])
  assert.equal(profile.signers[0].signerName, 'Alex Director')
  assert.equal(profile.signers[1].signerName, 'Sam Trustee')
  assert.equal(profile.complete, true)
})

test('requires distinct buyer and seller spouses when both parties are married in community', () => {
  const profile = resolveLegalDocumentSignerProfile({
    packetType: 'otp',
    placeholders: {
      buyer_entity_type: 'individual',
      buyer_marital_regime: 'in_community',
      buyer_full_name: 'Buyer One',
      buyer_email: 'buyer@example.com',
      buyer_spouse_full_name: 'Buyer Spouse',
      buyer_spouse_email: 'buyer-spouse@example.com',
      seller_entity_type: 'individual',
      seller_marital_regime: 'in_community',
      seller_full_name: 'Seller One',
      seller_email: 'seller@example.com',
      seller_spouse_full_name: 'Seller Spouse',
      seller_spouse_email: 'seller-spouse@example.com',
      property_title_type: 'full_title',
      finance_type: 'cash',
    },
  })

  assert.deepEqual(profile.signers.map((signer) => signer.role), [
    'purchaser_1',
    'buyer_spouse',
    'seller',
    'seller_spouse',
  ])
  assert.equal(profile.complete, true)
})

test('adds a captured co-buyer without confusing them with a spouse', () => {
  const profile = resolveLegalDocumentSignerProfile({
    packetType: 'otp',
    placeholders: {
      buyer_entity_type: 'individual',
      buyer_marital_regime: 'single',
      buyer_full_name: 'Buyer One',
      buyer_email: 'buyer@example.com',
      co_buyer_full_name: 'Buyer Two',
      co_buyer_email: 'buyer-two@example.com',
      seller_entity_type: 'individual',
      seller_marital_regime: 'single',
      seller_full_name: 'Seller',
      seller_email: 'seller@example.com',
      property_title_type: 'full_title',
      finance_type: 'cash',
    },
  })

  assert.equal(profile.signers.find((signer) => signer.role === 'purchaser_2')?.label, 'Second buyer')
  assert.equal(profile.signers.some((signer) => signer.role === 'buyer_spouse'), false)
})

test('reports missing signer contact facts before a signing journey starts', () => {
  const profile = resolveLegalDocumentSignerProfile({
    packetType: 'otp',
    placeholders: {
      buyer_entity_type: 'company',
      buyer_representative_name: 'Alex Director',
      seller_entity_type: 'individual',
      seller_marital_regime: 'single',
      seller_full_name: 'Seller One',
      property_title_type: 'full_title',
      finance_type: 'cash',
    },
  })

  assert.deepEqual(profile.missingRequiredSignerFacts.map((issue) => issue.label), [
    'Buyer representative email',
    'Seller email',
  ])
  assert.equal(profile.complete, false)
})
