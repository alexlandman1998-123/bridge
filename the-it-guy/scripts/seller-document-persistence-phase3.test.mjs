import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { syncSellerDocumentRequirements } from '../src/lib/sellerDocumentRequirementEngine.js'

const listing = {
  id: '11111111-1111-4111-8111-111111111111',
  listingStatus: 'onboarding_completed',
  sellerOnboardingStatus: 'completed',
  sellerOnboarding: {
    status: 'completed',
    formData: {
      sellerType: 'natural_person',
      propertyStructureType: 'full_title',
      gasInstallation: true,
      solarInstallation: true,
      occupancyStatus: 'tenant_occupied',
      mandateStatus: 'signed',
    },
  },
}

const syncResult = syncSellerDocumentRequirements(listing, [])
const generatedKeys = syncResult.upsertRows.map((row) => row.requirement_key)

assert.ok(generatedKeys.includes('gas_compliance_certificate'))
assert.ok(generatedKeys.includes('solar_compliance_documents'))
assert.ok(generatedKeys.includes('lease_agreement'))
assert.ok(syncResult.upsertRows.every((row) => row.applies_to))
assert.ok(syncResult.upsertRows.every((row) => row.visibility))

const serviceSource = readFileSync(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')
const mutationVariantStart = serviceSource.indexOf('const PRIVATE_LISTING_REQUIREMENT_MUTATION_VARIANTS')
const mutationVariantEnd = serviceSource.indexOf('const PRIVATE_LISTING_SELECT_VARIANT_CACHE')
assert.notEqual(mutationVariantStart, -1)
assert.notEqual(mutationVariantEnd, -1)

const mutationVariantSource = serviceSource.slice(mutationVariantStart, mutationVariantEnd)
assert.match(serviceSource, /function buildPrivateListingRequirementMutationPayload/)
assert.match(serviceSource, /async function upsertPrivateListingRequirementRows/)
assert.match(serviceSource, /PRIVATE_LISTING_REQUIREMENT_SELECT_FIELDS_NO_APPLIES_TO/)
assert.match(serviceSource, /PRIVATE_LISTING_REQUIREMENT_SELECT_FIELDS_BASE/)
assert.doesNotMatch(mutationVariantSource, /'applies_to'/)
assert.doesNotMatch(mutationVariantSource, /'visibility'/)
assert.match(serviceSource, /property_compliance: 'compliance'/)
assert.match(serviceSource, /occupancy: 'property'/)
assert.match(serviceSource, /seller_authority: 'seller_identity'/)

assert.match(serviceSource, /const requirementSync = await syncPrivateListingRequirements\(rpcContext\.listing,\s*\{\s*emitActivity: true,\s*reason: 'onboarding_completed'/s)
assert.match(serviceSource, /const requirementSync = await syncPrivateListingRequirements\(transitionResult\?\.listing \|\| fallbackListing,\s*\{\s*emitActivity: true,\s*reason: 'onboarding_completed'/s)
assert.doesNotMatch(serviceSource, /void syncPrivateListingRequirements\(transitionResult\?\.listing\?\.id \|\| context\.listing\.id/)

assert.match(serviceSource, /options\.syncRequirements !== false/)
assert.match(serviceSource, /reason: options\.requirementSyncReason \|\| 'onboarding_form_saved'/)
assert.match(serviceSource, /reason: 'seller_onboarding_progress'/)

console.log('seller document persistence phase 3 tests passed')
