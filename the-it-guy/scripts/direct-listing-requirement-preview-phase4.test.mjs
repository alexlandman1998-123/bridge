import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { buildDirectListingIntakePayload } from '../src/lib/directListingIntakeModel.js'
import {
  buildSellerRequirementProfile,
  getRequiredSellerDocuments,
} from '../src/lib/sellerDocumentRequirementEngine.js'

const agentListingsSource = readFileSync(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8')

const intake = buildDirectListingIntakePayload({
  sellerType: 'deceased_estate',
  deceasedEstateName: 'Estate Late Jane Doe',
  executorsText: 'Alex Executor',
  sellerEmail: 'alex@example.test',
  propertyAddress: '12 Estate Road',
  propertyType: 'house',
})
const profile = buildSellerRequirementProfile({
  listingStatus: 'onboarding_completed',
  sellerOnboardingStatus: 'completed',
  sellerOnboarding: { status: 'completed', formData: intake.sellerOnboardingFormData },
  sellerCanonicalFacts: intake.sellerCanonicalFacts,
})
const keys = getRequiredSellerDocuments({ ...profile, lifecycleStatus: 'onboarding_completed' })
  .map((requirement) => requirement.requirement_key)

assert.equal(profile.sellerBranch, 'deceased_estate')
assert.ok(keys.includes('seller_executor_authority'))
assert.ok(keys.includes('deceased_death_certificate'))
assert.match(agentListingsSource, /directListingRequirementPreview/)
assert.match(agentListingsSource, /Required seller documents/)
assert.match(agentListingsSource, /getRequiredSellerDocuments/)

console.log('Direct listing requirement preview phase 4 checks passed.')
