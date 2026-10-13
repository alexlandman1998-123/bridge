import { listingExpiryError } from './listingExpiryModel.js'
import { salesPropertyTypeIssue } from './listingCaptureModel.js'
import { getPrivatePropertyHeadlineIssues, PRIVATE_PROPERTY_POA_PRICE_MESSAGE } from './privatePropertyContentRules.js'
// Sources: Property24 Listing Service v55 OpenAPI (2026-10-10), Private
// Property Agency Feed Service Rev 4.7 pp.14–20 / Appendix B, and the website
// publication RPC. These are channel requirements, not CRM completeness rules.
const text = value => String(value ?? '').trim()
const number = value => text(value) === '' ? null : Number(value)
export const LISTING_CHANNEL_LABELS = { property24: 'Property24', private_property: 'Private Property', agency_website: 'Website' }

export function getListingFieldIssues(form = {}, { rental = false, channels = form.selectedSyndicationChannels || [] } = {}) {
  const selected = new Set(channels)
  const typeIssue = !rental && salesPropertyTypeIssue(form)
  const issues = typeIssue ? [typeIssue] : []
  const add = (channel, field, step, message) => {
    if (!selected.has(channel)) return
    const existing = issues.find(row => row.field === field && row.message === message)
    if (existing) existing.channels.push(channel)
    else issues.push({ field, step, message, channels: [channel] })
  }
  if (!rental && Object.hasOwn(form, 'listingExpiryDate')) {
    const expiryIssue = listingExpiryError(form.listingExpiryDate)
    if (expiryIssue) for (const channel of ['property24', 'private_property', 'agency_website']) add(channel, 'listingExpiryDate', 'syndication', expiryIssue)
  }
  const category = text(form.propertyCategory || 'residential')
  const priceField = rental ? 'monthlyRent' : 'listingPrice'
  const price = number(form[priceField] ?? form.estimatedAskingPrice)
  const priceStep = rental ? 'terms' : 'property'
  const descriptionField = rental ? 'description' : 'listingDescription'
  const description = text(form[descriptionField])
  const photos = rental ? form.galleryImages : form.listingImages
  const photoField = rental ? 'galleryImages' : 'listingImages'
  for (const channel of Object.keys(LISTING_CHANNEL_LABELS)) {
    if (!(Number.isFinite(price) && price > 0) && !(['property24', 'agency_website'].includes(channel) && !rental && form.priceOnApplication)) add(channel, priceField, priceStep, rental ? 'Enter a rental amount greater than zero.' : channel === 'private_property' && form.priceOnApplication ? PRIVATE_PROPERTY_POA_PRICE_MESSAGE : 'Enter a price greater than zero.')
    if (channel !== 'agency_website' && !description) add(channel, descriptionField, 'marketing', 'Add the public description.')
    const minimum = channel === 'private_property' ? 3 : 1
    if ((photos?.length || 0) < minimum) add(channel, photoField, 'marketing', `Add at least ${minimum} photo${minimum === 1 ? '' : 's'}.`)
    if (channel !== 'agency_website' && !text(form.propertyType)) add(channel, 'propertyType', 'property', 'Choose the property type.')
  }
  if (!text(form.property24SuburbId) && !text(form.suburb)) add('property24', 'suburb', 'property', 'Choose the suburb so Property24 can find the area.')
  const address = form.propertyAddressValue || {}
  for (const [field, label, limit] of [['streetNumber', 'street number', 10], ['streetName', 'street name', 100], ['suburb', 'suburb', 100], ['city', 'city / town', 100], ['province', 'province', 0]]) {
    const value = text(form[field] || address[field] || (field === 'streetName' ? form.route || address.route : ''))
    if (!value) add('private_property', field, 'property', `Add the ${label} in Address details.`)
    else if (limit && value.length > limit) add('private_property', field, 'property', `Keep the ${label} within ${limit} characters.`)
  }
  const province = text(form.province || address.province).toLowerCase().replace(/[ _-]/g, '')
  if (province && !['gauteng', 'westerncape', 'easterncape', 'northerncape', 'kwazulunatal', 'kzn', 'freestate', 'limpopo', 'northwest', 'mpumalanga'].includes(province)) add('private_property', 'province', 'property', 'Choose a valid South African province in Address details.')
  if (category === 'residential') {
    if (number(form.bedrooms) === null || number(form.bedrooms) < 0) add('private_property', 'bedrooms', 'property', 'Enter bedrooms; zero is allowed for a studio.')
    if (!(number(form.bathrooms) > 0)) add('private_property', 'bathrooms', 'property', 'Enter a bathroom count greater than zero.')
  }
  if (['land', 'vacant_land'].includes(category) && !(number(form.erfSize || form.landSize) > 0)) add('private_property', 'erfSize', 'property', 'Enter the land area and its unit.')
  const sectional = /sectional/i.test(text(form.propertyStructureType)) || ['Unit', 'ExclusiveUseArea'].includes(form.rentalPortalFacts?.['propertyInfo.propertyDescription.propertyDescriptionType'])
  if (sectional) for (const [field, label] of [['complexName', 'complex / scheme name'], ['unitNumber', 'unit number']]) {
    if (!text(form[field])) add('private_property', field, 'property', `Add the ${label} for this sectional-title property.`)
  }
  if (!rental && price > 0 && price < 10000) add('private_property', priceField, priceStep, 'Private Property requires a sale price of at least R10,000.')
  for (const issue of getPrivatePropertyHeadlineIssues(rental ? form.title : form.listingTitle ?? form.title)) add('private_property', rental ? 'title' : 'listingTitle', 'marketing', issue.message)
  if (description.length > 4000) add('private_property', descriptionField, 'marketing', 'Keep the description within 4,000 characters.')
  if (/https?:\/\/|www\./i.test(description)) add('private_property', descriptionField, 'marketing', 'Remove website links from the public description.')
  if (/(?:\+?\d[\s().-]*){9,}/.test(description)) add('private_property', descriptionField, 'marketing', 'Remove telephone numbers from the public description.')
  const street = [text(form.streetNumber), text(form.streetName)].filter(Boolean).join(' ')
  if (text(form.streetNumber) && text(form.streetName) && description.toLowerCase().includes(street.toLowerCase())) add('private_property', descriptionField, 'marketing', 'Remove the street address from the description; use Address details.')
  if (rental) {
    const frequency = text(form.rentalPriceFrequency || 'monthly')
    if (!['monthly', 'weekly', 'daily', 'annual', 'per_square_metre'].includes(frequency)) add('property24', 'rentalPriceFrequency', 'terms', 'Choose a supported rental price frequency.')
    if (frequency === 'annual') add('private_property', 'rentalPriceFrequency', 'terms', 'Private Property does not accept annual rental pricing; choose another frequency or deselect that channel.')
    if (frequency === 'per_square_metre' && !(['commercial', 'industrial', 'retail', 'mixed_use'].includes(category) || (['land', 'vacant_land'].includes(category) && text(form.propertyType).toLowerCase().replace(/[ _-]+/g, '_') === 'commercial_land'))) add('private_property', 'rentalPriceFrequency', 'terms', 'Per-square-metre rental pricing requires commercial property or commercial land on Private Property.')
    if (form.rentalMandateType === 'house_share') add('property24', 'rentalMandateType', 'terms', 'Property24 cannot advertise this house-share rental. Choose another rental type or remove Property24.')
    if (form.depositPolicy !== 'no_deposit' && (number(form.depositAmount) === null || !Number.isFinite(number(form.depositAmount)) || number(form.depositAmount) < 0)) add('private_property', 'depositAmount', 'terms', 'Enter the deposit amount, or select No deposit.')
  }
  for (const field of ['bedrooms', 'bathrooms', 'garages', 'parkingBays', 'floorSize', 'erfSize']) {
    if (text(form[field]) && (!Number.isFinite(Number(form[field])) || Number(form[field]) < 0)) {
      for (const channel of ['property24', 'private_property']) add(channel, field, 'property', `Enter a valid non-negative value for ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}.`)
    }
  }
  return issues
}

// Property requirements for finishing a sale. Save draft creation deliberately
// bypasses these; saved-listing edits enforce the same details before writing.
export function getSalesListingRequiredIssues(form = {}, { editing = false } = {}) {
  const issues = []
  const add = (field, message) => issues.push({ field, step: 'property', message, channels: [] })
  if (!text(form.propertyAddress)) add('propertyAddress', 'Property address is required.')
  if (editing && !text(form.propertyStructureType)) add('propertyStructureType', 'Ownership scheme is required.')
  if (!text(form.propertyType)) add('propertyType', editing ? 'Descriptive property type is required.' : 'Property type is required.')
  const price = number(form.listingPrice ?? form.estimatedAskingPrice)
  if (!form.priceOnApplication && !(Number.isFinite(price) && price > 0)) add('listingPrice', editing ? 'Enter a listing price or select Price on Application.' : 'Listing price or price on application is required.')
  return issues
}

// One correction per field, even when several websites require it. Keep every
// restriction and its destination: photo minimums and POA rules can differ.
export function groupListingFieldIssues(issues = []) {
  const groups = new Map()
  for (const issue of issues) {
    const key = issue.field || issue.message
    if (!groups.has(key)) groups.set(key, { ...issue, requirements: [], channels: [], basic: false })
    const group = groups.get(key)
    group.basic ||= !issue.channels?.length
    group.channels = [...new Set([...group.channels, ...(issue.channels || [])])]
    const requirement = group.requirements.find(row => row.message === issue.message)
    if (requirement) requirement.channels = [...new Set([...requirement.channels, ...(issue.channels || [])])]
    else group.requirements.push({ ...issue, channels: [...(issue.channels || [])] })
  }
  return [...groups.values()]
}
