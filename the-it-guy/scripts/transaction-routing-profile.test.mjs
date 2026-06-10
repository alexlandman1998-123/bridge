import assert from 'node:assert/strict'

import {
  TRANSACTION_ROUTING_PROFILE_VERSION,
  resolveTransactionRoutingProfile,
  resolveWorkflowKeysForRoutingProfile,
  summarizeTransactionRoutingProfile,
} from '../src/services/transactionRoutingProfileService.js'

function assertIncludes(values, expected, message) {
  assert.equal(values.includes(expected), true, message)
}

{
  const profile = resolveTransactionRoutingProfile({
    transaction: {
      id: 'cash-freehold',
      finance_type: 'cash',
      transaction_type: 'resale',
      property_type: 'freehold house',
      buyer_entity_type: 'individual',
      seller_entity_type: 'individual',
      seller_has_existing_bond: false,
      vat_applicable: false,
    },
  })

  assert.equal(profile.version, TRANSACTION_ROUTING_PROFILE_VERSION)
  assert.equal(profile.financeType, 'cash')
  assert.equal(profile.transactionType, 'resale')
  assert.equal(profile.propertyTenure, 'freehold')
  assert.equal(profile.vatTreatment, 'transfer_duty')
  assert.equal(profile.workflowTemplateKey, 'cash_freehold_resale')
  assert.deepEqual(profile.requiredWorkflowKeys, ['sales_otp', 'finance_cash', 'attorney_transfer', 'registration'])
}

{
  const profile = resolveTransactionRoutingProfile({
    transaction: {
      id: 'bond-sectional',
      finance_type: 'bond',
      transaction_type: 'private_sale',
      property_type: 'sectional title apartment',
      buyer_entity_type: 'company',
      seller_entity_type: 'individual',
    },
  })

  assert.equal(profile.financeType, 'bond')
  assert.equal(profile.propertyTenure, 'sectional_title')
  assert.equal(profile.requiresBondAttorney, true)
  assert.equal(profile.workflowTemplateKey, 'bond_sectional_title')
  assertIncludes(profile.requiredWorkflowKeys, 'finance_bond', 'Bond deal should route to bond finance workflow.')
  assertIncludes(profile.requiredWorkflowKeys, 'attorney_bond', 'Bond deal should require attorney bond lane.')
  assertIncludes(profile.requiredDocumentGroups, 'sectional_title_body_corporate', 'Sectional title should require body corporate document group.')
  assertIncludes(profile.requiredDocumentGroups, 'bond_originator', 'Bond deal should require bond document group.')
}

{
  const profile = resolveTransactionRoutingProfile({
    listing: {
      id: 'listing-dev',
      developmentId: 'dev-1',
      propertyType: 'Apartment',
      sellerOnboarding: {
        formData: {
          sellerType: 'developer',
          vatApplicable: 'yes',
        },
      },
    },
    offer: {
      financeType: 'cash',
    },
    buyerLead: {
      purchaserType: 'trust',
    },
  })

  assert.equal(profile.transactionType, 'development_sale')
  assert.equal(profile.financeType, 'cash')
  assert.equal(profile.sellerEntityType, 'developer')
  assert.equal(profile.buyerEntityType, 'trust')
  assert.equal(profile.vatTreatment, 'vat')
  assert.equal(profile.workflowTemplateKey, 'development_cash')
  assertIncludes(profile.requiredDocumentGroups, 'developer_sale_pack', 'Development sale should require developer sale pack group.')
}

{
  const profile = resolveTransactionRoutingProfile({
    transaction: {
      id: 'commercial-vat',
      finance_type: 'cash',
      transaction_type: 'commercial',
      property_type: 'commercial warehouse',
      buyer_entity_type: 'company',
      seller_entity_type: 'company',
      vat_treatment: 'zero_rated_going_concern',
    },
  })

  assert.equal(profile.transactionType, 'commercial')
  assert.equal(profile.isCommercialTransaction, true)
  assert.equal(profile.vatTreatment, 'zero_rated_going_concern')
  assert.equal(profile.workflowTemplateKey, 'commercial_zero_rated_going_concern')
  assertIncludes(profile.requiredDocumentGroups, 'commercial_due_diligence', 'Commercial route should include due diligence group.')
  assertIncludes(profile.requiredDocumentGroups, 'vat_transfer_treatment', 'Commercial VAT route should include VAT treatment group.')
}

{
  const profile = resolveTransactionRoutingProfile({
    transaction: {
      id: 'hybrid-trust-cancellation',
      funding_type: 'partial_bond',
      property_transaction_type: 'private_sale',
      property_type: 'freehold',
      buyer_entity_type: 'individual',
      seller_entity_type: 'trust',
      seller_has_existing_bond: true,
    },
  })

  assert.equal(profile.financeType, 'hybrid')
  assert.equal(profile.sellerEntityType, 'trust')
  assert.equal(profile.requiresBondAttorney, true)
  assert.equal(profile.requiresCancellationAttorney, true)
  assertIncludes(profile.requiredWorkflowKeys, 'finance_hybrid', 'Hybrid deal should route to hybrid finance.')
  assertIncludes(profile.requiredWorkflowKeys, 'seller_bond_cancellation', 'Existing seller bond should require cancellation workflow.')
  assertIncludes(profile.requiredDocumentGroups, 'property_finance_existing_bond', 'Existing seller bond should require cancellation document group.')
}

{
  const profile = resolveTransactionRoutingProfile({
    transaction: {
      id: 'missing-facts',
      property_type: 'house',
    },
  })

  assert.equal(profile.financeType, 'unknown')
  assertIncludes(profile.requiredWorkflowKeys, 'finance_unknown', 'Unknown finance should create finance_unknown workflow.')
  assertIncludes(profile.missingFields, 'finance_type', 'Missing finance should be diagnosed.')
  assertIncludes(profile.missingFields, 'transaction_type', 'Missing transaction type should be diagnosed.')
  assertIncludes(profile.missingFields, 'property_tenure', 'Missing tenure should be diagnosed.')
}

{
  const profile = resolveTransactionRoutingProfile({
    transaction: {
      finance_type: 'bond',
      transaction_type: 'private_sale',
      property_type: 'estate hoa',
      buyer_entity_type: 'individual',
      seller_entity_type: 'individual',
    },
  })

  assert.deepEqual(resolveWorkflowKeysForRoutingProfile(profile), profile.requiredWorkflowKeys)
  assert.equal(summarizeTransactionRoutingProfile(profile), 'bond + estate_hoa + private_sale')
}

console.log('transaction-routing-profile tests passed')
