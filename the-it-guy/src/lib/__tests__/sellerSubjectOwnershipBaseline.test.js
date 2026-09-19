import assert from 'node:assert/strict'
import test from 'node:test'

import { SELLER_SUBJECT_OWNERSHIP_FIXTURES, SELLER_SUBJECT_PHASE0_KNOWN_GAPS } from '../__fixtures__/sellerSubjectOwnershipFixtures.js'
import { resolveListingSellerProfileBranch } from '../listingSellerProfileBuilderModel.js'
import { resolveSellerOnboardingFlow } from '../sellerOnboardingFlow.js'

test('known seller ownership routes retain their onboarding branch', () => {
  for (const fixture of SELLER_SUBJECT_OWNERSHIP_FIXTURES) {
    const flow = resolveSellerOnboardingFlow(fixture.form)
    assert.equal(flow.seller_branch, fixture.expectedBranch, fixture.label)
  }
})

test('listing and onboarding agree for every currently supported ownership route', () => {
  for (const fixture of SELLER_SUBJECT_OWNERSHIP_FIXTURES.filter((item) => item.listingProfileSupported)) {
    const listingBranch = resolveListingSellerProfileBranch(fixture.form)
    const onboardingBranch = resolveSellerOnboardingFlow(fixture.form).seller_branch
    const expectedListingBranch = fixture.key === 'foreign_individual' ? 'foreign_individual' : fixture.expectedBranch
    assert.equal(listingBranch, expectedListingBranch, `${fixture.label} listing route`)
    assert.equal(onboardingBranch, fixture.expectedBranch, `${fixture.label} onboarding route`)
  }
})

test('phase 0 records the ownership-model gaps that later phases must remove', () => {
  assert.deepEqual(SELLER_SUBJECT_PHASE0_KNOWN_GAPS, [
    'The seller lead profile compatibility resolver defaults an unresolved seller to individual.',
    'The listing-side profile builder does not yet model a power-of-attorney seller branch.',
    'Lead, listing, and onboarding currently resolve ownership from separate compatibility paths.',
  ])
})
