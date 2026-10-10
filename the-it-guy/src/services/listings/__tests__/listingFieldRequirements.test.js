import { describe, expect, it } from 'vitest'
import { getListingFieldIssues } from '../listingFieldRequirements'

const form = {
  propertyCategory: 'residential', propertyType: 'House', listingPrice: '1500000', monthlyRent: '15000',
  streetNumber: '12', streetName: 'Example Road', suburb: 'Newlands', city: 'Cape Town', province: 'Western Cape',
  bedrooms: '0', bathrooms: '1', listingDescription: 'Sunny property.', description: 'Sunny property.',
  listingImages: [1, 2, 3], galleryImages: [1, 2, 3], rentalPriceFrequency: 'monthly', depositPolicy: 'no_deposit',
  selectedSyndicationChannels: ['property24', 'private_property', 'agency_website'],
}

describe('channel-specific capture requirements', () => {
  for (const rental of [false, true]) for (const category of ['residential', 'commercial', 'industrial', 'retail', 'mixed_use', 'agricultural', 'vacant_land']) {
    it(`${category} ${rental ? 'rental' : 'sale'} does not require seller, landlord, mandate, approval or floor size`, () => {
      expect(getListingFieldIssues({ ...form, propertyCategory: category, erfSize: category === 'vacant_land' ? '500' : '' }, { rental })).toEqual([])
    })
  }
  it('allows explicit POA on P24 and Website while explaining PP numeric pricing', () => {
    const issues = getListingFieldIssues({ ...form, priceOnApplication: true, listingPrice: '' })
    expect(issues).toEqual([expect.objectContaining({ field: 'listingPrice', channels: ['private_property'] })])
  })
  it('reports address and marketing issues in their capture steps, only for selected channels', () => {
    const issues = getListingFieldIssues({ ...form, streetNumber: '', listingImages: [1], listingDescription: 'Visit www.example.com' })
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'streetNumber', step: 'property', channels: ['private_property'] }),
      expect.objectContaining({ field: 'listingDescription', step: 'marketing', channels: ['private_property'] }),
      expect.objectContaining({ field: 'listingImages', step: 'marketing', channels: ['private_property'] }),
    ]))
    expect(getListingFieldIssues({ ...form, streetNumber: '', listingImages: [1], selectedSyndicationChannels: ['property24'] })).toEqual([])
    expect(getListingFieldIssues({}, { channels: [] })).toEqual([])
  })
  it('uses PP land and residential requirements without applying them to other categories/channels', () => {
    expect(getListingFieldIssues({ ...form, propertyCategory: 'vacant_land' }).map(x => x.field)).toContain('erfSize')
    expect(getListingFieldIssues({ ...form, propertyCategory: 'vacant_land', selectedSyndicationChannels: ['property24'] })).toEqual([])
    expect(getListingFieldIssues({ ...form, bathrooms: 0 }).map(x => x.field)).toContain('bathrooms')
    expect(getListingFieldIssues({ ...form, propertyCategory: 'commercial', bathrooms: '' })).toEqual([])
  })
  it('handles each rental cadence without silently converting the price', () => {
    for (const frequency of ['monthly', 'weekly', 'daily', 'annual', 'per_square_metre']) {
      expect(getListingFieldIssues({ ...form, rentalPriceFrequency: frequency, selectedSyndicationChannels: ['property24'] }, { rental: true })).toEqual([])
    }
    expect(getListingFieldIssues({ ...form, rentalPriceFrequency: 'annual' }, { rental: true }).map(x => x.field)).toContain('rentalPriceFrequency')
    expect(getListingFieldIssues({ ...form, propertyCategory: 'commercial', rentalPriceFrequency: 'per_square_metre' }, { rental: true })).toEqual([])
    expect(getListingFieldIssues({ ...form, propertyCategory: 'vacant_land', erfSize: 500, rentalPriceFrequency: 'per_square_metre' }, { rental: true }).map(x => x.field)).toContain('rentalPriceFrequency')
  })
  it('allows zero deposit explicitly and requires an amount only for PP rentals', () => {
    expect(getListingFieldIssues({ ...form, depositPolicy: '', depositAmount: '' }, { rental: true }).map(x => x.field)).toContain('depositAmount')
    expect(getListingFieldIssues({ ...form, depositPolicy: 'deposit_required', depositAmount: '0' }, { rental: true })).toEqual([])
    expect(getListingFieldIssues({ ...form, depositPolicy: '', selectedSyndicationChannels: ['property24'] }, { rental: true })).toEqual([])
  })
})
