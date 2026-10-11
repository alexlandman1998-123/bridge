import { getRentalListingValidationIssues, validateRentalListingDraftForm } from '../../rentals/rentalListingDraftModel.js'
import { getPropertyTypeOptionsByCategory } from '../../../lib/propertyTaxonomy'
import { describe, expect, it } from 'vitest'
import { getListingFieldIssues, getSalesListingRequiredIssues, groupListingFieldIssues } from '../listingFieldRequirements'

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
      expect(getListingFieldIssues({ ...form, propertyCategory: category, propertyType: getPropertyTypeOptionsByCategory(category)[0].value, erfSize: category === 'vacant_land' ? '500' : '' }, { rental })).toEqual([])
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
    expect(getListingFieldIssues({ ...form, propertyCategory: 'vacant_land', propertyType: 'vacant_land' }).map(x => x.field)).toContain('erfSize')
    expect(getListingFieldIssues({ ...form, propertyCategory: 'vacant_land', propertyType: 'vacant_land', selectedSyndicationChannels: ['property24'] })).toEqual([])
    expect(getListingFieldIssues({ ...form, bathrooms: 0 }).map(x => x.field)).toContain('bathrooms')
    expect(getListingFieldIssues({ ...form, propertyCategory: 'commercial', propertyType: 'office_building', bathrooms: '' })).toEqual([])
  })
  it('handles each rental cadence without silently converting the price', () => {
    for (const frequency of ['monthly', 'weekly', 'daily', 'annual', 'per_square_metre']) {
      expect(getListingFieldIssues({ ...form, rentalPriceFrequency: frequency, selectedSyndicationChannels: ['property24'] }, { rental: true })).toEqual([])
    }
    expect(getListingFieldIssues({ ...form, rentalPriceFrequency: 'annual' }, { rental: true }).map(x => x.field)).toContain('rentalPriceFrequency')
    expect(getListingFieldIssues({ ...form, propertyCategory: 'commercial', rentalPriceFrequency: 'per_square_metre' }, { rental: true })).toEqual([])
    expect(getListingFieldIssues({ ...form, propertyCategory: 'vacant_land', propertyType: 'vacant_land', erfSize: 500, rentalPriceFrequency: 'per_square_metre' }, { rental: true }).map(x => x.field)).toContain('rentalPriceFrequency')
  })
  it('allows zero deposit explicitly and requires an amount only for PP rentals', () => {
    expect(getListingFieldIssues({ ...form, depositPolicy: '', depositAmount: '' }, { rental: true }).map(x => x.field)).toContain('depositAmount')
    expect(getListingFieldIssues({ ...form, depositPolicy: 'deposit_required', depositAmount: '0' }, { rental: true })).toEqual([])
    expect(getListingFieldIssues({ ...form, depositPolicy: '', selectedSyndicationChannels: ['property24'] }, { rental: true })).toEqual([])
  })
})


it('does not treat a deliberately cleared or invalid price as ready using an older estimate', () => {
 for (const listingPrice of ['', 'Infinity', 'invalid', '-1']) {
  const draft = { ...form, listingPrice, estimatedAskingPrice: '1500000', selectedSyndicationChannels: ['property24'] }
  expect(getListingFieldIssues(draft).map(issue => issue.field)).toContain('listingPrice')
  expect(getSalesListingRequiredIssues(draft).map(issue => issue.field)).toContain('listingPrice')
 }
})

it('retains differing provider reasons with one field correction and keeps optional details out', () => {
 const issues = [...getSalesListingRequiredIssues({}), ...getListingFieldIssues({ selectedSyndicationChannels: ['property24', 'private_property'] })]
 const grouped = groupListingFieldIssues(issues)
 expect(grouped.filter(issue => issue.field === 'listingPrice')).toHaveLength(1)
 expect(grouped.find(issue => issue.field === 'listingImages').requirements.map(issue => issue.message)).toEqual(['Add at least 1 photo.', 'Add at least 3 photos.'])
 expect(grouped.some(issue => ['sellerEmail','landlordEmail','floorSize','mandateStatus'].includes(issue.field))).toBe(false)
})

it('includes ownership when editing an existing sale but leaves it out of new-sale minimums', () => {
 expect(getSalesListingRequiredIssues({}, { editing: true }).map(issue => issue.field)).toContain('propertyStructureType')
 expect(getSalesListingRequiredIssues({}).map(issue => issue.field)).not.toContain('propertyStructureType')
})


for (const category of ['residential', 'commercial', 'industrial', 'retail', 'mixed_use', 'agricultural', 'vacant_land']) {
 it(`${category} rental checklist keeps optional unanswered details out and selected requirements in`, () => {
  const draft = { ...form, propertyAddress: 'Example Road', propertyCategory: category, propertyType: getPropertyTypeOptionsByCategory(category)[0].value, erfSize: category === 'vacant_land' ? '500' : '', selectedSyndicationChannels: [] }
  expect(getRentalListingValidationIssues(draft, { organisationId: 'org' })).toEqual([])
  const selected = { ...draft, selectedSyndicationChannels: ['private_property'], streetNumber: '', galleryImages: [], depositPolicy: '', depositAmount: '' }
  const issues = getRentalListingValidationIssues(selected, { organisationId: 'org' })
  expect(issues.map(issue => issue.message)).toEqual(validateRentalListingDraftForm(selected, { organisationId: 'org' }))
  for (const field of ['streetNumber', 'galleryImages', 'depositAmount']) expect(issues).toContainEqual(expect.objectContaining({ field, channels: ['private_property'] }))
  expect(issues.some(issue => ['landlordEmail', 'mandateStatus', 'floorSize'].includes(issue.field))).toBe(false)
 })
}

it('maps entered optional rental validation failures to real fields and sections', () => {
 const issues = getRentalListingValidationIssues({ ...form, propertyAddress: 'Example Road', landlordEmail: 'bad', mandateEndDate: 'impossible', videoLink: 'bad', selectedSyndicationChannels: [] }, { organisationId: 'org' })
 expect(issues).toEqual(expect.arrayContaining([
  expect.objectContaining({ field: 'landlordEmail', step: 'landlord' }),
  expect.objectContaining({ field: 'mandateEndDate', step: 'landlord' }),
  expect.objectContaining({ field: 'videoLink', step: 'marketing' }),
 ]))
})


it('keeps a private rental with invalid rent out of the ready state while permitting an unfinished draft', () => {
 for (const monthlyRent of ['-1', '0', '', 'Infinity']) {
  const issues = getRentalListingValidationIssues({ ...form, propertyAddress: 'Example Road', selectedSyndicationChannels: [], monthlyRent }, { organisationId: 'org' })
  expect(issues).toContainEqual(expect.objectContaining({ field: 'monthlyRent', step: 'terms', channels: [] }))
 }
})


it('combines identical basic and channel reasons without mutating the validators', () => {
 const source = [{ field: 'monthlyRent', message: 'Enter a positive rent.', channels: [] }, { field: 'monthlyRent', message: 'Enter a positive rent.', channels: ['property24', 'private_property'] }]
 const group = groupListingFieldIssues(source)[0]
 expect(group.basic).toBe(true)
 expect(group.requirements).toHaveLength(1)
 expect(group.requirements[0].channels).toEqual(['property24', 'private_property'])
 expect(source[0].channels).toEqual([])
})
