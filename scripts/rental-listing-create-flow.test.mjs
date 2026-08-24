import assert from 'node:assert/strict'

import {
  buildRentalListingCreateProgress,
  RENTAL_LISTING_CREATE_FLOW_VERSION,
  RENTAL_LISTING_CREATE_STEPS,
} from '../the-it-guy/src/services/rentals/rentalListingCreateFlowModel.js'
import { RENTAL_LISTING_INITIAL_FORM } from '../the-it-guy/src/services/rentals/rentalListingDraftModel.js'

assert.equal(RENTAL_LISTING_CREATE_FLOW_VERSION, 'arch9_rental_listing_create_flow_v1')
assert.deepEqual(RENTAL_LISTING_CREATE_STEPS.map((step) => step.key), [
  'property',
  'landlord',
  'terms',
  'readiness',
])

const emptyProgress = buildRentalListingCreateProgress(RENTAL_LISTING_INITIAL_FORM)
assert.equal(emptyProgress.completedSteps, 1)
assert.equal(emptyProgress.firstIncompleteStep, 'property')
assert.equal(emptyProgress.steps.find((step) => step.key === 'readiness').complete, true)

const partialProgress = buildRentalListingCreateProgress({
  ...RENTAL_LISTING_INITIAL_FORM,
  propertyAddress: '10 Beach Road',
  monthlyRent: '18500',
  availableFrom: '2026-09-01',
  landlordName: 'A Landlord',
  landlordEmail: 'landlord@example.com',
})
assert.equal(partialProgress.steps.find((step) => step.key === 'property').complete, true)
assert.equal(partialProgress.steps.find((step) => step.key === 'landlord').complete, true)
assert.equal(partialProgress.firstIncompleteStep, 'terms')

const completeProgress = buildRentalListingCreateProgress({
  ...RENTAL_LISTING_INITIAL_FORM,
  propertyAddress: '10 Beach Road',
  monthlyRent: '18500',
  availableFrom: '2026-09-01',
  landlordName: 'A Landlord',
  landlordPhone: '+27110000000',
  depositAmount: '37000',
})
assert.equal(completeProgress.completedSteps, 4)
assert.equal(completeProgress.firstIncompleteStep, '')

console.log('rental listing create flow tests passed')
