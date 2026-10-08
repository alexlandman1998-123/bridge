import { resolveRentalPortalType } from '../rentals/rentalPortalFieldContract.js'
import { getSpecialistSalesListingSchema } from './specialistSalesListingSchema.js'
import { evaluateProperty24ListingCategoryContract } from '../../../server/property24/listingCategoryContract.js'
import { evaluateProperty24ListingCategoryModel } from '../../../server/property24/listingCategoryModel.js'
import { resolveProperty24Phase2PropertyTypeId } from '../../../server/property24/propertyTypeCatalogue.js'

const text = (value) => String(value ?? '').trim()
const positive = (value) => text(value) !== '' && Number.isFinite(Number(value)) && Number(value) > 0
const externalChannels = (form) => (form.selectedSyndicationChannels || []).filter((channel) => ['property24', 'private_property', 'agency_website'].includes(channel))
export const hasCapturePriceOrPoa = (form) => Boolean(form.priceOnApplication) || positive(form.listingPrice || form.estimatedAskingPrice)

export function listingCapturePublicationIssues(form, { rental = false } = {}) {
  const issues = []
  const add = (field, step, message, code = `publication-${field}`) => issues.push({ code, field, step, message })
  const channels = externalChannels(form)
  const descriptionField = rental ? 'description' : 'listingDescription'
  const photosField = rental ? 'galleryImages' : 'listingImages'
  const priceField = rental ? 'monthlyRent' : 'listingPrice'
  const priceStep = rental ? 'terms' : 'property'
  if (channels.length && !text(form[descriptionField])) add(descriptionField, 'marketing', 'Enter the public listing description.')
  const photoMinimum = channels.includes('private_property') ? 3 : channels.some((channel) => ['property24', 'agency_website'].includes(channel)) ? 1 : 0
  if ((form[photosField]?.length || 0) < photoMinimum) add(photosField, 'marketing', `Add at least ${photoMinimum} listing photo${photoMinimum === 1 ? '' : 's'} for the selected channels.`)
  if (channels.some((channel) => ['property24', 'private_property'].includes(channel)) && !text(form.suburb) && !(rental && text(form.property24SuburbId))) add('suburb', 'property', 'Enter the suburb so the portal can match the property location.')
  if (channels.includes('agency_website') && !text(form.suburb) && !text(form.city)) add('suburb', 'property', 'Enter a suburb or city for the agency website.', 'website-location')
  if (channels.some((channel) => ['property24', 'private_property'].includes(channel)) && ['land', 'vacant_land'].includes(form.propertyCategory) && !positive(form.erfSize)) add('erfSize', 'property', 'Enter an erf or land size greater than zero for the selected portal.', 'portal-land-area')
  if (channels.includes('private_property')) {
    const line = text(form.propertyAddress).split(',')[0]
    const inferred = line.match(/^(\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?)\s+(.+)$/) || line.match(/^(?:portion|ptn)\s+(\d+[A-Za-z]?)\s+(?:of\s+)?(.+)$/i)
    if (!text(form.streetNumber) && !inferred) add('streetNumber', 'property', 'Enter the street number or rural portion number for Private Property.')
    if (!text(form.streetName) && !text(inferred?.[2] || line)) add('streetName', 'property', 'Enter the street name for Private Property.')
    if (!text(form.city)) add('city', 'property', 'Enter the city or town for Private Property.')
    if (!text(form.province)) add('province', 'property', 'Enter the province for Private Property.')
    if ((form.propertyCategory || 'residential') === 'residential') {
      for (const field of ['bedrooms', 'bathrooms']) if (!text(form[field])) add(field, 'property', `Confirm ${field}; enter zero when there are none.`)
    }
    if (/https?:\/\/|www\./i.test(text(form[descriptionField]))) add(descriptionField, 'marketing', 'Remove web addresses from the Private Property description.', 'description-web-address')
    if (/(?:\+?\d[\s().-]*){9,}/.test(text(form[descriptionField]))) add(descriptionField, 'marketing', 'Remove phone numbers from the Private Property description.', 'description-phone-number')
  }
  if (channels.some((channel) => ['private_property', 'agency_website'].includes(channel)) && !positive(form[priceField] || (!rental && form.estimatedAskingPrice))) add(priceField, priceStep, 'Private Property and the agency website require a price greater than zero. Enter a price or remove those channels.', 'channel-price')
  if (channels.includes('property24')) {
    const listingType = rental ? 'Rental' : 'Sale'
    const contract = evaluateProperty24ListingCategoryContract({ listing: form, listingType })
    if (contract.blockers.length) add('propertyCategory', 'property', `Property24 does not currently support this ${contract.category} ${listingType.toLowerCase()} category. Choose a supported category or remove Property24.`, 'property24-category')
    let propertyTypeId = (rental && resolveRentalPortalType(form.propertyCategory, form.propertyType)?.property24TypeId) || resolveProperty24Phase2PropertyTypeId(form.propertyType)
    if (contract.category === 'commercial' && (!propertyTypeId || [4, 5, 6].includes(propertyTypeId))) propertyTypeId = 11
    if (contract.category === 'agricultural' && (!propertyTypeId || [4, 5, 6].includes(propertyTypeId))) propertyTypeId = 10
    const model = evaluateProperty24ListingCategoryModel({ category: contract.category, listingType, propertyTypeId, isPOA: !rental && Boolean(form.priceOnApplication) })
    if (!propertyTypeId || model.blockers.some((code) => code.includes('property_type_mismatch'))) add('propertyType', 'property', 'Choose a Property24 property type that matches this category.', 'property24-type')
  }
  return issues
}

export function salesListingCaptureIssues(form = {}, { sellerName = '', sellerUnidentified = false, developer = false } = {}) {
  const issues = []
  const add = (field, step, message, code = field) => issues.push({ code, field, step, message })
  if (!developer && !sellerUnidentified) {
    if (!text(sellerName)) add(['trust', 'company', 'close_corporation', 'other'].includes(form.sellerType) ? 'entityName' : 'sellerName', 'seller', 'Enter the seller or entity name.')
    if (!text(form.sellerPhone) && !text(form.sellerEmail)) add('sellerContact', 'seller', 'Enter a seller email address or mobile number.')
  }
  if (text(form.sellerEmail) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(form.sellerEmail))) add('sellerEmail', 'seller', 'Enter a valid seller email address.')
  if (!text(form.propertyAddress)) add('propertyAddress', 'property', 'Enter the property address.')
  if (!text(form.propertyType)) add('propertyType', 'property', 'Choose a property type.')
  if (!hasCapturePriceOrPoa(form)) add('listingPrice', 'property', 'Enter a price greater than zero or choose price on application.')
  for (const [field, label] of Object.entries({ bedrooms: 'Bedrooms', bathrooms: 'Bathrooms', garages: 'Garages', parkingCount: 'Parking', floorSize: 'Floor size', erfSize: 'Erf size', ratesTaxes: 'Rates and taxes', levies: 'Levies' })) {
    if (field === 'erfSize' && text(form.propertyType).toLowerCase() === 'apartment' && !['vacant_land', 'land'].includes(form.propertyCategory)) continue
    if (text(form[field]) && (!Number.isFinite(Number(form[field])) || Number(form[field]) < 0)) add(field, 'property', `${label} must be a number of zero or more.`)
  }
  const schema = getSpecialistSalesListingSchema(form.propertyCategory, form.listingType)
  for (const field of schema.fields) {
    const step = field.key === 'erfSize' ? 'property' : 'features'
    if (field.required && field.kind !== 'boolean' && !(field.key === 'listingTerms' && positive(form.listingPrice || form.estimatedAskingPrice)) && !text(form[field.key])) add(field.key, step, `Enter ${field.label.toLowerCase()}.`)
    else if (field.kind === 'measurement' && text(form[field.key]) && !positive(form[field.key])) add(field.key, step, `${field.label} must be a number greater than zero.`)
  }
  if (form.selectedSyndicationChannels?.includes('property24') && text(form.grossLettableArea) && (!Number.isInteger(Number(form.grossLettableArea)) || Number(form.grossLettableArea) <= 0)) add('grossLettableArea', 'features', 'Property24 gross lettable area must be a whole number of square metres greater than zero.', 'property24GrossLettableArea')
  return [...issues, ...listingCapturePublicationIssues(form)]
}

// Forward navigation must validate every page being skipped, including a page
// revisited after its values changed. Saving a private draft remains independent.
export function issuesBeforeListingStep(issues, steps, targetStep) {
  const target = steps.findIndex((step) => (step.key || step) === targetStep)
  return issues.filter((issue) => {
    const index = steps.findIndex((step) => (step.key || step) === issue.step)
    return index >= 0 && index < target
  })
}

export function salesPortalCaptureIssues(form, channel) {
  return salesListingCaptureIssues({ ...form, selectedSyndicationChannels: [channel] }, { sellerUnidentified: true })
    .filter((issue) => issue.step !== 'seller')
}
