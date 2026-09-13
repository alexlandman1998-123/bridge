import assert from 'node:assert/strict'

import { buildDirectListingIntakePayload } from '../src/lib/directListingIntakeModel.js'
import {
  buildSellerRequirementProfile,
  generateSellerDocumentRequirements,
} from '../src/lib/sellerDocumentRequirementEngine.js'

const intake = buildDirectListingIntakePayload({
  sellerType: 'deceased_estate',
  deceasedEstateName: 'Estate Late Jane Doe',
  sellerRegistrationNumber: 'EST-2026-001',
  executorsText: 'Alex Executor\nTaylor Executor',
  sellerName: 'Alex Executor',
  sellerEmail: 'alex@example.test',
  propertyAddress: '12 Estate Road',
  propertyType: 'house',
})

assert.equal(intake.seller.sellerLegalType, 'deceased_estate')
assert.equal(intake.seller.ownerEntityType, 'deceased_estate')
assert.equal(intake.seller.deceased_estate.estateName, 'Estate Late Jane Doe')
assert.equal(intake.seller.deceased_estate.executors.length, 2)
assert.equal(intake.seller.deceased_estate.executors[0].fullName, 'Alex Executor')

const profile = buildSellerRequirementProfile({
  listingStatus: 'onboarding_completed',
  sellerOnboardingStatus: 'completed',
  sellerOnboarding: { status: 'completed', formData: intake.sellerOnboardingFormData },
  sellerCanonicalFacts: intake.sellerCanonicalFacts,
})
const requirementKeys = generateSellerDocumentRequirements(profile).map((requirement) => requirement.key || requirement.requirement_key)

assert.equal(profile.sellerBranch, 'deceased_estate')
assert.equal(profile.estateOrHoa, false, 'a deceased estate must not be mistaken for a property estate/HOA')
for (const key of ['seller_executor_authority', 'executor_id_document', 'deceased_death_certificate', 'estate_owner_details']) {
  assert.ok(requirementKeys.includes(key), `expected ${key} for a deceased estate`)
}

console.log('Direct listing ownership phase 1 checks passed.')
