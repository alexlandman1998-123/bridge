import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildSellerRequirementProfile,
  getRequiredSellerStructuredFacts,
} from '../sellerDocumentRequirementEngine.js'
import { getSellerOnboardingVisibleFields } from '../sellerOnboardingFlow.js'
import { resolveSellerOnboardingFlowContract } from '../sellerOnboardingFlowContract.js'
import {
  transformSellerOnboardingToFacts,
  validateSellerOnboardingFacts,
} from '../../services/documents/sellerOnboardingFactTransformer.js'

const sectionalForm = {
  ownershipType: 'individual',
  propertyCategory: 'residential',
  propertyStructureType: 'sectional_title',
  schemeName: 'Example Scheme',
  sectionNumber: '12',
}

test('sectional title requires scheme and section, but not body corporate or managing-agent details', () => {
  const flow = resolveSellerOnboardingFlowContract(sectionalForm)

  assert.ok(flow.required_fields.includes('property.scheme.name'))
  assert.ok(flow.required_fields.includes('property.scheme.section_number'))
  assert.equal(flow.required_fields.includes('property.scheme.managing_agent.name'), false)
  assert.ok(flow.optional_fields.includes('property.scheme.managing_agent.name'))
  assert.equal(getSellerOnboardingVisibleFields(flow).includes('property.scheme.body_corporate_name'), false)

  const facts = transformSellerOnboardingToFacts(sectionalForm)
  const readiness = validateSellerOnboardingFacts(facts)
  assert.equal(readiness.required.some((item) => item.code === 'sectional_managing_agent_missing'), false)
  assert.equal(readiness.recommended.some((item) => item.code === 'sectional_managing_agent_missing'), false)
})

test('body-corporate details remain a non-blocking structured fact', () => {
  const profile = buildSellerRequirementProfile({
    id: 'listing-1',
    listingStatus: 'onboarding_completed',
    propertyStructureType: 'sectional_title',
    sellerOnboarding: { status: 'completed', formData: sectionalForm },
  })
  const requirement = getRequiredSellerStructuredFacts(profile)
    .find((row) => row.requirement_key === 'body_corporate_details')

  assert.ok(requirement)
  assert.equal(requirement.is_required, false)
})
