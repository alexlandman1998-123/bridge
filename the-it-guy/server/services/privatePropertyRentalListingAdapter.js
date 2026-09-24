import {
  buildPrivatePropertyListingXml,
  createPrivatePropertyListingPlan,
} from './privatePropertyListingMapper.js'
import {
  normalizePrivatePropertyText,
} from './privatePropertyClient.js'
import {
  buildRentalListingIndexRow,
  getRentalListingFacts,
  getRentalListingPublication,
  getRentalListingRentalInfo,
} from '../../src/services/rentals/rentalListingIndexModel.js'

export const PRIVATE_PROPERTY_RENTAL_LISTING_ADAPTER_VERSION = 'arch9_private_property_rental_listing_adapter_v1'

const MANDATE_READY_STATUSES = new Set(['signed', 'signed_uploaded'])
const MARKETING_READY_STATUSES = new Set(['approved', 'ready'])

function normalizeKey(value = '') {
  return normalizePrivatePropertyText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function firstText(...values) {
  for (const value of values) {
    const text = normalizePrivatePropertyText(value)
    if (text) return text
  }
  return ''
}

function firstNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || normalizePrivatePropertyText(value) === '') continue
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return numeric
  }
  return null
}

function normalizeDateOnly(value = '') {
  const text = normalizePrivatePropertyText(value)
  if (!text) return ''
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

function isSpecialistRentalCategory(value = '') {
  return ['commercial', 'industrial', 'retail', 'vacant_land', 'land', 'mixed_use', 'farm', 'farms']
    .includes(normalizeKey(value))
}

function normalizeMedia(media = []) {
  return (Array.isArray(media) ? media : [])
    .map((item, index) => {
      if (!item) return null
      if (typeof item === 'string') {
        const url = normalizePrivatePropertyText(item)
        return url ? { media_type: 'image', file_url: url, sort_order: index, is_cover: index === 0 } : null
      }
      if (typeof item !== 'object') return null
      return {
        ...item,
        media_type: item.media_type || item.mediaType || 'image',
        file_url: item.file_url || item.fileUrl || item.url || item.publicUrl || item.public_url || item.signedUrl || item.signed_url,
        sort_order: item.sort_order ?? item.sortOrder ?? index,
        is_cover: item.is_cover ?? item.isCover ?? index === 0,
      }
    })
    .filter((item) => normalizePrivatePropertyText(item?.file_url))
}

function extractMediaItems(listing = {}, publication = {}) {
  const candidates = [
    listing.photos,
    listing.images,
    listing.media,
    listing.gallery,
    listing.photoUrls,
    listing.photo_urls,
    publication.photos,
    publication.images,
    publication.media,
    publication.photoUrls,
    publication.photo_urls,
  ].flatMap((value) => Array.isArray(value) ? value : value ? [value] : [])

  for (const imageUrl of [
    listing.imageUrl,
    listing.image_url,
    listing.heroImageUrl,
    listing.hero_image_url,
    publication.imageUrl,
    publication.image_url,
    publication.heroImageUrl,
    publication.hero_image_url,
  ]) {
    if (normalizePrivatePropertyText(imageUrl)) candidates.push(imageUrl)
  }

  return normalizeMedia(candidates)
}

function splitStreetAddress(address = '') {
  // Address display strings often include the suburb, unit and formatted
  // address after the first comma. Private Property's StreetName accepts the
  // street portion only (max 50 characters), never that complete display
  // string.
  const text = normalizePrivatePropertyText(address).split(',')[0].trim()
  const match = text.match(/^(\d+[A-Za-z]?)\s+(.+)$/)
  if (!match) return { streetNumber: '', streetName: text }
  return { streetNumber: match[1], streetName: match[2] }
}

function buildRentalDescription({ baseDescription = '', row = {}, rentalInfo = {} } = {}) {
  const description = firstText(baseDescription)
  const rentalFacts = [
    row.availableFrom ? `Available from: ${row.availableFrom}` : '',
    row.depositAmount ? `Deposit: R${row.depositAmount}` : '',
    row.leasePeriodMonths ? `Lease period: ${row.leasePeriodMonths} months` : '',
    row.furnishedStatus ? `Furnished: ${row.furnishedStatus}` : '',
    row.petsPolicy ? `Pets: ${row.petsPolicy}` : '',
    row.utilitiesPolicy ? `Utilities: ${row.utilitiesPolicy}` : '',
  ].filter(Boolean)
  const terms = rentalFacts.length ? `Rental terms:\n${rentalFacts.join('\n')}` : ''
  const inspectionNotes = firstText(rentalInfo.inspectionNotes, rentalInfo.inspection_notes)
  return [description, terms, inspectionNotes ? `Inspection notes:\n${inspectionNotes}` : ''].filter(Boolean).join('\n\n')
}

function hasRentalModuleShape(listing = {}, options = {}) {
  return normalizeKey(options.listingType) === 'rental' ||
    normalizeKey(listing.listingCategory || listing.listing_category) === 'rental' ||
    Boolean(getRentalListingRentalInfo(listing).monthlyRent || getRentalListingRentalInfo(listing).monthly_rent)
}

export function isPrivatePropertyRentalListing(listing = {}, options = {}) {
  return hasRentalModuleShape(listing, options)
}

function getAdapterDataBlockers({ values = {}, options = {} } = {}) {
  const blockers = []
  if (!values.monthlyRent) blockers.push('missing_rental_monthly_rent')
  if (!values.availableFrom) blockers.push('missing_rental_available_from')
  // Private Property accepts either its suburb ID or a complete textual address.
  // Do not make an optional lookup ID a hard rental-publish requirement: the
  // base listing mapper already validates suburb, town, and province when no
  // ID is supplied.
  if (!MANDATE_READY_STATUSES.has(normalizeKey(values.mandateStatus))) blockers.push('rental_mandate_not_signed')
  if (!MARKETING_READY_STATUSES.has(normalizeKey(values.marketingApprovalStatus))) blockers.push('rental_marketing_not_approved')
  if (!values.rentalPriceFrequency) blockers.push('missing_rental_price_frequency')
  if (normalizeKey(values.rentalPriceFrequency) === 'annual') blockers.push('private_property_rental_price_frequency_not_supported')
  if (normalizeKey(values.rentalPriceFrequency) === 'per_square_metre' && !isSpecialistRentalCategory(values.propertyCategory)) {
    blockers.push('private_property_per_square_metre_requires_specialist_category')
  }
  if (!values.depositPolicy || normalizeKey(values.depositPolicy) === 'not_captured') blockers.push('missing_rental_deposit_policy')
  if (normalizeKey(options.soleMandateExclusiveDays)) blockers.push('rental_exclusive_days_not_supported')
  return blockers
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)))
}

export function createPrivatePropertyRentalListingPlan({
  listing = {},
  publication = {},
  media = null,
  existingSync = {},
  agentMapping = {},
  options = {},
} = {}) {
  const rentalPublication = {
    ...getRentalListingPublication(listing),
    ...publication,
  }
  const facts = getRentalListingFacts(listing)
  const rentalInfo = getRentalListingRentalInfo(listing)
  const addressProfile = facts.addressProfile || facts.address_profile || {}
  const row = buildRentalListingIndexRow({
    ...listing,
    listingPublicationData: rentalPublication,
  })
  const address = splitStreetAddress(firstText(row.address, listing.streetAddress, listing.street_address, listing.addressLine1, listing.address_line_1))
  const monthlyRent = firstNumber(options.price, row.monthlyRent, rentalInfo.monthlyRent, rentalInfo.monthly_rent, listing.askingPrice, listing.asking_price)
  const depositPolicy = firstText(row.depositPolicy, rentalInfo.depositPolicy, rentalInfo.deposit_policy)
  const depositAmount = normalizeKey(depositPolicy) === 'no_deposit'
    ? 0
    : firstNumber(options.deposit, row.depositAmount, rentalInfo.depositAmount, rentalInfo.deposit_amount)
  const rentalPriceFrequency = firstText(options.rentalPriceType, row.rentalPriceFrequency, rentalInfo.rentalPriceFrequency, rentalInfo.rental_price_frequency)
  const rentalMandateType = firstText(row.rentalMandateType, rentalInfo.rentalMandateType, rentalInfo.rental_mandate_type)
  const retirementAccommodation = firstText(row.retirementAccommodation, facts.propertyProfile?.retirementAccommodation, facts.propertyProfile?.retirement_accommodation)
  const availableFrom = normalizeDateOnly(firstText(options.availableFrom, row.availableFrom, rentalInfo.availableFrom, rentalInfo.available_from))
  const mandateEndDate = normalizeDateOnly(firstText(options.expiryDate, listing.mandateEndDate, listing.mandate_end_date, listing.expiryDate, listing.expiry_date))
  const suburbId = firstText(options.suburbId, listing.privatePropertySuburbId, listing.private_property_suburb_id, rentalPublication.privatePropertySuburbId, rentalPublication.private_property_suburb_id)
  const propertyId = firstText(options.propertyId, listing.privatePropertyPropertyId, listing.private_property_property_id, listing.listingReference, listing.listing_reference, listing.id)
  const description = buildRentalDescription({
    baseDescription: firstText(rentalPublication.description, listing.description, facts.description, listing.listingPreviewDescription, listing.listing_preview_description),
    row,
    rentalInfo,
  })
  const explicitMedia = normalizeMedia(media)
  const adaptedMedia = explicitMedia.length ? explicitMedia : extractMediaItems(listing, rentalPublication)
  const adaptedListing = {
    ...listing,
    listingType: 'Rental',
    listing_type: 'Rental',
    listingCategory: 'rental',
    listing_category: 'rental',
    askingPrice: monthlyRent,
    asking_price: monthlyRent,
    deposit: depositAmount || 0,
    availableFrom,
    available_from: availableFrom,
    expiryDate: mandateEndDate,
    expiry_date: mandateEndDate,
    streetName: firstText(options.streetName, listing.streetName, listing.street_name, address.streetName),
    street_name: firstText(options.streetName, listing.streetName, listing.street_name, address.streetName),
    streetNumber: firstText(options.streetNumber, listing.streetNumber, listing.street_number, address.streetNumber),
    street_number: firstText(options.streetNumber, listing.streetNumber, listing.street_number, address.streetNumber),
    suburb: firstText(options.suburb, row.suburb, listing.suburb, facts.suburb),
    city: firstText(options.town, row.city, listing.city, facts.city),
    province: firstText(options.province, row.province, listing.province, facts.province),
    propertyType: firstText(row.propertyType, listing.propertyType, listing.property_type, 'Apartment'),
    propertyCategory: firstText(listing.propertyCategory, listing.property_category, facts.propertyCategory, facts.property_category, 'residential'),
    exactAddressVisibility: firstText(options.exactAddressVisibility, addressProfile.exactAddressVisibility, addressProfile.exact_address_visibility, listing.exactAddressVisibility, listing.exact_address_visibility),
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    garages: firstNumber(listing.garages, listing.garage_count, row.parkingBays, 0),
    parkingBays: row.parkingBays,
    mandateType: normalizeKey(rentalMandateType) === 'house_share' ? 'house_share' : 'rental',
    mandate_type: normalizeKey(rentalMandateType) === 'house_share' ? 'house_share' : 'rental',
  }
  const adaptedPublication = {
    ...rentalPublication,
    listingType: 'Rental',
    listing_type: 'Rental',
    askingPrice: monthlyRent,
    asking_price: monthlyRent,
    deposit: depositAmount || 0,
    availableFrom,
    available_from: availableFrom,
    expiryDate: mandateEndDate,
    expiry_date: mandateEndDate,
    title: firstText(rentalPublication.title, row.title),
    description,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    propertyType: row.propertyType,
    property_type: row.propertyType,
  }
  const adaptedAgentMapping = {
    ...agentMapping,
    privatePropertyAgentId: firstText(agentMapping.privatePropertyAgentId, agentMapping.private_property_agent_id, options.agentIds, options.agentId),
  }
  const adapterOptions = {
    ...options,
    listingType: 'Rental',
    mandateType: normalizeKey(rentalMandateType) === 'house_share' ? 'HouseShare' : 'Rental',
    status: 'to let',
    propertyId,
    suburbId,
    price: monthlyRent,
    deposit: depositAmount || 0,
    availableFrom,
    expiryDate: mandateEndDate,
    streetName: firstText(options.streetName, adaptedListing.streetName),
    streetNumber: firstText(options.streetNumber, adaptedListing.streetNumber),
    town: firstText(options.town, adaptedListing.city),
    province: firstText(options.province, adaptedListing.province),
    category: firstText(options.category, adaptedListing.propertyCategory, 'Residential'),
    exactAddressVisibility: firstText(options.exactAddressVisibility, adaptedListing.exactAddressVisibility, 'hide_street_address'),
    rentalPriceType: firstText(rentalPriceFrequency, rentalPublication.rentalPriceType, rentalPublication.rental_price_type, listing.rentalPriceType, listing.rental_price_type),
    soleMandateExclusiveDays: '',
  }

  const basePlan = createPrivatePropertyListingPlan({
    listing: adaptedListing,
    publication: adaptedPublication,
    media: adaptedMedia,
    existingSync,
    agentMapping: adaptedAgentMapping,
    options: adapterOptions,
  })
  const values = {
    monthlyRent,
    depositAmount,
    depositPolicy,
    rentalPriceFrequency,
    propertyCategory: adaptedListing.propertyCategory,
    availableFrom,
    suburbId,
    mandateStatus: row.mandateStatus,
    marketingApprovalStatus: row.marketingApprovalStatus,
  }
  const adapterDataBlockers = getAdapterDataBlockers({ values, options })
  const dataBlockers = unique([...(basePlan.dataBlockers || []), ...adapterDataBlockers])
  const technicalBlockers = unique(basePlan.technicalBlockers || [])
  const qualityWarnings = unique([
    ...(basePlan.qualityWarnings || []),
    ...(normalizeKey(retirementAccommodation) === 'yes' ? ['private_property_retirement_accommodation_not_mapped'] : []),
  ])
  const canPreview = dataBlockers.length === 0 && technicalBlockers.length === 0 && Boolean(basePlan.listingXml)
  const payload = {
    ...basePlan.payload,
    listingType: 'Rental',
    propertyStatus: 'ToLet',
    mandateType: basePlan.payload?.mandateType || 'Rental',
    price: monthlyRent || basePlan.payload?.price || 0,
    deposit: depositAmount || 0,
    availableFrom: availableFrom || basePlan.payload?.availableFrom,
  }
  const listingXml = canPreview ? buildPrivatePropertyListingXml({ payload }) : ''

  return {
    version: PRIVATE_PROPERTY_RENTAL_LISTING_ADAPTER_VERSION,
    phase: 'private-property-rental-listing-backend-preview',
    generatedAt: new Date().toISOString(),
    safety: {
      privatePropertyApiCalled: false,
      databaseWritten: false,
      listingPublished: false,
    },
    status: canPreview ? 'PREVIEW_READY' : 'BLOCKED',
    canPreview,
    canSubmit: false,
    dataBlockers,
    technicalBlockers,
    qualityWarnings,
    summary: {
      ...basePlan.summary,
      listingType: 'Rental',
      mandateType: basePlan.summary?.mandateType || 'Rental',
      propertyStatus: 'ToLet',
      price: monthlyRent || 0,
      deposit: depositAmount || 0,
      rentalPriceType: basePlan.summary.rentalPriceType || '',
      rentalPriceFrequency,
      depositPolicy,
      rentalMandateType: normalizeKey(rentalMandateType) === 'house_share' ? 'house_share' : 'standard_rental',
      availableFrom,
      suburbId: Number(suburbId) || null,
      rentalMandateStatus: row.mandateStatus,
      rentalMarketingApprovalStatus: row.marketingApprovalStatus,
      privatePropertyRentalAdapter: true,
    },
    payload,
    listingXml,
    nextStep: canPreview
      ? 'Private Property rental XML is ready for a controlled sandbox submit with --apply.'
      : 'Resolve the rental blockers before submitting to Private Property.',
  }
}
