import { test } from 'node:test'
import assert from 'node:assert/strict'
import { issuesBeforeListingStep, salesListingCaptureIssues, salesPortalCaptureIssues, listingCapturePublicationIssues } from '../listingCaptureValidation.js'
import { RENTAL_LISTING_INITIAL_FORM, validateRentalListingDraftForm, validateRentalListingDraftIssues, rentalListingPublicationIssues } from '../../rentals/rentalListingDraftModel.js'
import { listingIssueEditorUrl, listingPublicationIssueTarget } from '../listingPublicationIssueTarget.js'
import { createPrivatePropertyListingPlan } from '../../../../server/services/privatePropertyListingMapper.js'
import { createProperty24ListingPlan } from '../../../../server/services/property24ListingMapper.js'

const sales = { sellerType: 'individual', sellerPhone: '0821112222', propertyAddress: '12 Example Road', streetNumber: '12', streetName: 'Example Road', suburb: 'Newlands', city: 'Pretoria', province: 'Gauteng', propertyType: 'House', propertyCategory: 'residential', listingType: 'sale', listingPrice: '1100000', listingDescription: 'A spacious family home.', bedrooms: '0', bathrooms: '0', listingImages: [{ url: 'https://photos.test/1.jpg' }, { url: 'https://photos.test/2.jpg' }, { url: 'https://photos.test/3.jpg' }] }
const rental = { ...RENTAL_LISTING_INITIAL_FORM, landlordName: 'Owner', propertyAddress: sales.propertyAddress, streetNumber: '12', streetName: 'Example Road', suburb: 'Newlands', city: 'Pretoria', province: 'Gauteng', monthlyRent: '11000', depositPolicy: 'no_deposit', availableFrom: '2026-11-01', description: sales.listingDescription, galleryImages: sales.listingImages, bedrooms: '0', bathrooms: '0' }

test('sales capture validates on the owning page without requiring signed documents or optional floor area', () => {
  assert.deepEqual(salesListingCaptureIssues(sales, { sellerName: 'Owner' }), [])
  assert.equal(salesListingCaptureIssues({ ...sales, listingPrice: '-1' }, { sellerName: 'Owner' })[0].field, 'listingPrice')
  assert.equal(salesListingCaptureIssues({ ...sales, sellerEmail: 'invalid' }, { sellerName: 'Owner' })[0].field, 'sellerEmail')
  assert.equal(salesPortalCaptureIssues(sales, 'property24').some((issue) => issue.field === 'floorSize'), false)
})
test('Private Property checks agree with the real mapper on photos, structured address and description restrictions', () => {
  const form = { ...sales, selectedSyndicationChannels: ['private_property'], listingImages: sales.listingImages.slice(0, 2), streetNumber: '', propertyAddress: 'Example Road', city: '', province: '', listingDescription: 'Call 0821112222 or visit https://example.test' }
  const issues = listingCapturePublicationIssues(form)
  for (const field of ['listingImages', 'streetNumber', 'city', 'province', 'listingDescription']) assert(issues.some((issue) => issue.field === field), field)
  const plan = createPrivatePropertyListingPlan({ listing: { id: 'listing-1', propertyType: 'House', propertyCategory: 'residential', askingPrice: 1100000, addressLine1: form.propertyAddress, suburb: form.suburb, bedrooms: 0, bathrooms: 0, description: form.listingDescription }, media: form.listingImages.map((image) => ({ media_type: 'image', file_url: image.url })), options: { branchGuid: 'branch-1', agentIds: ['agent-1'] } })
  for (const code of ['minimum_three_listing_image_urls_required', 'missing_street_number', 'missing_town_without_suburb_id', 'missing_province_without_suburb_id', 'illegal_description_phone_number', 'illegal_description_web_address']) assert(plan.dataBlockers.includes(code), code)
})
test('supported Property24 commercial sales allow unknown lettable area but reject an invalid supplied value', () => {
  const form = { ...sales, propertyCategory: 'commercial', zoning: 'Business', parking: 'Four bays', listingTerms: 'Cash sale', selectedSyndicationChannels: ['property24'] }
  assert.deepEqual(salesPortalCaptureIssues(form, 'property24'), [])
  const invalid = { ...form, grossLettableArea: '2.5' }
  assert(salesPortalCaptureIssues(invalid, 'property24').some((issue) => issue.field === 'grossLettableArea'))
  const plan = createProperty24ListingPlan({ listing: { ...invalid, askingPrice: 1100000, specialistFacts: { grossLettableArea: invalid.grossLettableArea, zoning: invalid.zoning, parking: invalid.parking } }, options: { expiryDate: '2099-01-01', property24SuburbId: 1 } })
  assert(plan.dataBlockers.includes('property24_commercial_gross_lettable_area_whole_sqm_required'))
})
test('unsupported Property24 categories are exposed during property capture for sales and rentals', () => {
  assert(salesPortalCaptureIssues({ ...sales, propertyCategory: 'industrial', warehouseOrFactoryArea: 10, yardSize: 10, powerSupply: '3 phase' }, 'property24').some((issue) => issue.code === 'property24-category'))
  assert(rentalListingPublicationIssues({ ...rental, propertyCategory: 'commercial', propertyType: 'Office', selectedSyndicationChannels: ['property24'], property24ExpiryDate: '2099-01-01' }).some((issue) => issue.code === 'property24-category'))
})
test('rental draft validation remains independent of channel publishing requirements', () => {
  assert.deepEqual(validateRentalListingDraftForm(rental, { organisationId: 'org' }), [])
  const form = { ...rental, galleryImages: [], property24ExpiryDate: '', selectedSyndicationChannels: ['property24'] }
  assert.deepEqual(validateRentalListingDraftForm(form, { organisationId: 'org' }), [])
  assert(rentalListingPublicationIssues(form).some((issue) => issue.field === 'property24ExpiryDate'))
  assert(rentalListingPublicationIssues(form).some((issue) => issue.field === 'galleryImages'))
})
test('rental capture rejects negative rent, invalid dates, unsupported frequency and supplies exact catalog field targets', () => {
  const issues = validateRentalListingDraftIssues({ ...rental, monthlyRent: '-1', availableFrom: '2026-02-30', rentalPriceFrequency: 'per_square_metre', rentalPortalFacts: { 'propertyInfo.age': -1 } }, { organisationId: 'org' })
  for (const field of ['monthlyRent', 'availableFrom', 'rentalPriceFrequency', 'propertyInfo.age']) assert(issues.some((issue) => issue.field === field), field)
  assert.equal(issues.find((issue) => issue.field === 'propertyInfo.age').step, 'features')
})
test('Property24 requires a future expiry and supported rental type, accepting a future mandate end date', () => {
  const form = { ...rental, selectedSyndicationChannels: ['property24'], mandateEndDate: '2099-01-01' }
  assert.deepEqual(rentalListingPublicationIssues(form), [])
  assert(rentalListingPublicationIssues({ ...form, property24ExpiryDate: '2026-10-08' }, { now: new Date('2026-10-08T12:00:00Z') }).some((issue) => issue.field === 'property24ExpiryDate'))
  assert(rentalListingPublicationIssues({ ...form, rentalMandateType: 'house_share' }).some((issue) => issue.field === 'rentalMandateType'))
})
test('forward jumps and revisited steps validate every page being skipped', () => {
  const issues = [{ step: 'seller', field: 'sellerName' }, { step: 'property', field: 'listingPrice' }, { step: 'marketing', field: 'listingImages' }]
  const steps = ['seller', 'property', 'features', 'marketing', 'syndication', 'review']
  assert.deepEqual(issuesBeforeListingStep(issues, steps, 'property'), [issues[0]])
  assert.deepEqual(issuesBeforeListingStep(issues, steps, 'review'), issues)
})
test('saved portal blockers retain exact edit targets and messages, and setup issues do not point to property fields', () => {
  const target = listingPublicationIssueTarget('minimum_three_listing_image_urls_required')
  assert.deepEqual(target, { step: 'marketing', field: 'listingImages' })
  const url = new URL(listingIssueEditorUrl('/listings/123/edit', target, 'Add three photos', { publicationScope: true }), 'https://app.arch9.co.za')
  assert.equal(url.searchParams.get('field'), 'listingImages'); assert.equal(url.searchParams.get('issue'), 'Add three photos')
  assert.equal(listingPublicationIssueTarget('missing_property24_agent_id'), null)
  assert.equal(listingPublicationIssueTarget('invalid_rental_field:propertyInfo.age', { rental: true }).field, 'propertyInfo.age')
  assert.equal(listingPublicationIssueTarget('unknown_future_requirement'), null)
})
