import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  buildSellerRequirementProfile,
  getRequiredSellerDocuments,
} from '../src/lib/sellerDocumentRequirementEngine.js'
import { buildDirectListingIntakePayload } from '../src/lib/directListingIntakeModel.js'

const agentListingsSource = readFileSync(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8')

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('Quick Add refreshes private listing requirements after direct listing intake persistence', () => {
  assert.match(agentListingsSource, /syncPrivateListingRequirements/)
  assert.match(agentListingsSource, /syncQuickAddDirectListingRequirements/)
  assert.match(agentListingsSource, /direct_listing_intake_created/)
  assert.match(agentListingsSource, /direct_listing_intake_merged/)
  assert.match(agentListingsSource, /requirementSync: directListingRequirementSync/)
})

test('Quick Add local fallback derives requirement rows from the seller document engine', () => {
  assert.match(agentListingsSource, /syncLocalSellerDocumentRequirements/)
  assert.match(agentListingsSource, /buildLocalQuickAddRequirementSync/)
  assert.match(agentListingsSource, /requiredDocuments: localRequirementSync\.requirements/)
  assert.match(agentListingsSource, /documentRequirements: localRequirementSync\.requirements/)
})

test('requirement sync stays downstream of form-data persistence and not-started onboarding', () => {
  const createPersistenceIndex = agentListingsSource.indexOf("direct listing intake form data persistence skipped after quick add create")
  const createSyncIndex = agentListingsSource.indexOf("direct_listing_intake_created")
  const mergePersistenceIndex = agentListingsSource.indexOf("direct listing intake form data persistence skipped during merge")
  const mergeSyncIndex = agentListingsSource.indexOf("direct_listing_intake_merged")

  assert.ok(createPersistenceIndex > -1 && createSyncIndex > createPersistenceIndex)
  assert.ok(mergePersistenceIndex > -1 && mergeSyncIndex > mergePersistenceIndex)
  assert.match(agentListingsSource, /status: 'not_started'/)
})

test('direct intake facts drive dynamic company/trust requirements without uploads', () => {
  const companyPayload = buildDirectListingIntakePayload({
    sellerType: 'company',
    sellerName: 'Company contact',
    sellerEmail: 'director@example.com',
    companyName: 'Requirement Sync Holdings',
    companyDirectors: [{ name: 'Dina', surname: 'Director' }],
    hasSignedMandate: true,
    hasSignedPropertyConditionDisclosure: false,
    hasSignedFicaForm: false,
  })
  const companyProfile = buildSellerRequirementProfile({
    id: 'listing_company',
    sellerCanonicalFacts: companyPayload.sellerCanonicalFacts,
    sellerOnboarding: { formData: companyPayload.sellerOnboardingFormData },
  })
  const companyRequirementKeys = getRequiredSellerDocuments(companyProfile).map((row) => row.requirement_key)

  assert.equal(companyProfile.sellerBranch, 'company')
  assert.equal(companyProfile.companyDirectors.length, 1)
  assert.deepEqual(companyRequirementKeys, ['seller_contact_confirmation'])
  const activeCompanyRequirementKeys = getRequiredSellerDocuments({
    ...companyProfile,
    lifecycleStatus: 'onboarding_completed',
  }).map((row) => row.requirement_key)
  assert.ok(activeCompanyRequirementKeys.includes('company_registration'), 'expected company-specific requirements once document collection is active')
  assert.equal(companyPayload.complianceDeclarations.uploadsRequired, false)

  const trustPayload = buildDirectListingIntakePayload({
    sellerType: 'trust',
    sellerName: 'Trust contact',
    sellerEmail: 'trustee@example.com',
    trustName: 'Requirement Sync Trust',
    trustees: [{ name: 'Tina', surname: 'Trustee' }],
  })
  const trustProfile = buildSellerRequirementProfile({
    id: 'listing_trust',
    sellerCanonicalFacts: trustPayload.sellerCanonicalFacts,
    sellerOnboarding: { formData: trustPayload.sellerOnboardingFormData },
  })
  const trustRequirementKeys = getRequiredSellerDocuments(trustProfile).map((row) => row.requirement_key)

  assert.equal(trustProfile.sellerBranch, 'trust')
  assert.equal(trustProfile.trustTrustees.length, 1)
  assert.deepEqual(trustRequirementKeys, ['seller_contact_confirmation'])
  const activeTrustRequirementKeys = getRequiredSellerDocuments({
    ...trustProfile,
    lifecycleStatus: 'onboarding_completed',
  }).map((row) => row.requirement_key)
  assert.ok(activeTrustRequirementKeys.includes('seller_trust_deed'), 'expected trust-specific requirements once document collection is active')
  assert.equal(trustPayload.complianceDeclarations.evidenceRequired, false)
})
