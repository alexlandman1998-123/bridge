import { describe, expect, it } from 'vitest'
import { getListingSellerFormData } from '../../../lib/listingSellerProfileBuilderModel'
import { getListingDescriptionConflicts } from '../listingDescriptionConsistency'

describe('signed-in diagnostic regressions', () => {
 it('opens the seller panel safely before a listing has loaded', () => {
  expect(getListingSellerFormData(null)).toEqual({})
  expect(getListingSellerFormData(undefined)).toEqual({})
  expect(getListingSellerFormData({ sellerOnboarding: { formData: { sellerName: 'Owner' } } })).toEqual({ sellerName: 'Owner' })
 })
 it.each([false, true])('flags conflicting bathroom copy for rental=%s without inventing a correction', rental => {
  const field = rental ? 'description' : 'listingDescription'
  expect(getListingDescriptionConflicts({ bathrooms: 2, [field]: 'A comfortable 1-bathroom home.' }, rental)).toHaveLength(1)
  expect(getListingDescriptionConflicts({ bathrooms: 2, [field]: 'A comfortable two-bathroom home.' }, rental)).toEqual([])
  expect(getListingDescriptionConflicts({ bathrooms: '', [field]: 'A 1-bathroom home.' }, rental)).toEqual([])
 })
})
