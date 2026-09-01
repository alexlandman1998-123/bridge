import assert from 'node:assert/strict'
import test from 'node:test'
import { getBuyerRequirementProfile } from '../../../lib/buyerRequirementEngine.js'
import {
  buildSellerRequirementProfile,
  getRequiredSellerDocuments,
} from '../../../lib/sellerDocumentRequirementEngine.js'
import { resolveLegalDocumentRequirements } from '../../../services/attorneyWorkflow/attorneyDocumentRequirementsResolver.js'
import { validateDocumentRequestCanonicalMatrix } from '../documentRequestCanonicalMatrix.js'
import {
  getCanonicalDocumentRequestMetadata,
  resolveCanonicalDocumentRequestKey,
} from '../documentRequestCanonicalAdapter.js'

test('canonical matrix validates before adapter mapping is used', () => {
  const validation = validateDocumentRequestCanonicalMatrix()
  assert.equal(validation.ok, true)
  assert.equal(validation.counts.requirements, 65)
  assert.equal(validation.counts.signoffDecisions, 7)
})

test('adapter maps legacy buyer, seller and attorney keys to canonical request keys', () => {
  assert.equal(resolveCanonicalDocumentRequestKey('company_resolution', 'buyer'), 'buyer_company_resolution')
  assert.equal(resolveCanonicalDocumentRequestKey('company_resolution_to_sell', 'seller'), 'seller_company_resolution')
  assert.equal(resolveCanonicalDocumentRequestKey('seller_beneficial_ownership', 'attorney'), 'seller_company_beneficial_ownership')
  assert.equal(resolveCanonicalDocumentRequestKey('signed_mandate', 'seller'), 'signed_mandate')
  assert.equal(resolveCanonicalDocumentRequestKey('signed_disclosure_form', 'seller'), 'property_condition_disclosure')
  assert.equal(resolveCanonicalDocumentRequestKey('signed_fica_declaration', 'seller'), 'seller_fica_declaration')
  assert.equal(resolveCanonicalDocumentRequestKey('information_sheet', 'buyer'), '')
  assert.equal(resolveCanonicalDocumentRequestKey('buyer_fica', 'attorney'), '')
  assert.equal(getCanonicalDocumentRequestMetadata('unknown_document', { context: 'buyer' }).canonicalDocumentRequestKnown, false)
})

test('buyer engine includes canonical metadata for entity beneficial ownership', () => {
  const companyProfile = getBuyerRequirementProfile({
    formData: {
      purchaser_type: 'company',
      purchaser_entity_type: 'company',
      purchase_finance_type: 'cash',
    },
  })
  const companyBeneficialOwnership = companyProfile.requiredDocuments.find((item) => item.key === 'buyer_company_beneficial_ownership')
  assert.equal(companyBeneficialOwnership?.canonicalDocumentRequestKey, 'buyer_company_beneficial_ownership')
  assert.equal(companyBeneficialOwnership?.requirementLevel, 'pending_policy_required')
  assert.equal(companyBeneficialOwnership?.canonicalDocumentRequestLevel, 'pending_policy_required')

  const trustProfile = getBuyerRequirementProfile({
    formData: {
      purchaser_type: 'trust',
      purchaser_entity_type: 'trust',
      purchase_finance_type: 'cash',
    },
  })
  const trustBeneficialOwnership = trustProfile.requiredDocuments.find((item) => item.key === 'buyer_trust_beneficial_ownership')
  assert.equal(trustBeneficialOwnership?.canonicalDocumentRequestKey, 'buyer_trust_beneficial_ownership')
  assert.equal(trustBeneficialOwnership?.canonicalDocumentRequestLevel, 'pending_policy_required')
})

test('seller engine keeps legacy keys while exposing canonical request metadata', () => {
  const profile = buildSellerRequirementProfile(
    {
      ownershipType: 'company',
      companyName: 'Arch9 Properties (Pty) Ltd',
      companyRegistrationNumber: '2024/123456/07',
      companyRegisteredAddress: '1 Example Road',
      companyDirectors: [{ name: 'Alex Principal', signingAuthority: true }],
      authorisedSignatoryName: 'Alex Principal',
      authorisedSignatoryCapacity: 'Director',
      companyResolutionDate: '2026-07-20',
      companyAuthorityBasis: 'Board resolution',
      sellerFirstName: 'Alex',
      sellerSurname: 'Principal',
      email: 'alex@example.com',
      phone: '0820000001',
      propertyCategory: 'residential',
      propertyType: 'house',
      propertyStructureType: 'freehold',
      propertyAddress: '1 Example Road',
      suburb: 'Gardens',
      city: 'Cape Town',
      province: 'Western Cape',
      mandateType: 'sole',
      askingPrice: 3000000,
    },
    {
      id: 'listing-1',
      status: 'onboarding_completed',
      assignedAgentId: 'agent-1',
      organisationId: 'org-1',
    },
  )

  const requirements = getRequiredSellerDocuments(profile)
  const companyResolution = requirements.find((item) => item.key === 'company_resolution_to_sell')
  const beneficialOwnership = requirements.find((item) => item.key === 'beneficial_ownership_fica')

  assert.equal(companyResolution?.canonicalDocumentRequestKey, 'seller_company_resolution')
  assert.equal(companyResolution?.canonicalDocumentRequestLevel, 'required')
  assert.equal(beneficialOwnership?.canonicalDocumentRequestKey, 'seller_company_beneficial_ownership')
  assert.equal(beneficialOwnership?.canonicalDocumentRequestLevel, 'pending_policy_required')
})

test('attorney resolver exposes canonical metadata for entity and transfer requirements', () => {
  const output = resolveLegalDocumentRequirements({
    finance_type: 'cash',
    transaction_type: 'private_sale',
    buyer_entity_type: 'trust',
    seller_entity_type: 'company',
  })

  const byId = new Map(output.requirements.map((item) => [item.id, item]))
  assert.equal(byId.get('sale_agreement_or_otp')?.canonicalDocumentRequestKey, 'signed_otp')
  assert.equal(byId.get('buyer_trust_beneficial_ownership')?.canonicalDocumentRequestKey, 'buyer_trust_beneficial_ownership')
  assert.equal(byId.get('buyer_trust_beneficial_ownership')?.canonicalDocumentRequestLevel, 'pending_policy_required')
  assert.equal(byId.get('seller_beneficial_ownership')?.canonicalDocumentRequestKey, 'seller_company_beneficial_ownership')
  assert.equal(byId.get('seller_company_resolution')?.canonicalDocumentRequestKey, 'seller_company_resolution')
})
