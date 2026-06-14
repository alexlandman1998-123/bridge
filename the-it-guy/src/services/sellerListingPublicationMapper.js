import { resolveSellerOnboardingFlow } from '../lib/sellerOnboardingFlow.js'
import {
  formatPropertyAddress,
  normalizePropertyAddress,
} from '../lib/sellerPropertyAddress.js'

function text(value) {
  return String(value || '').trim()
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function number(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(String(value).replace(/[^0-9.,-]/g, '').replace(/,/g, '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function bool(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const normalized = text(value).toLowerCase().replace(/[\s-]+/g, '_')
  return ['true', 'yes', 'y', '1', 'on', 'enabled'].includes(normalized)
}

function firstText(...values) {
  return values.map(text).find(Boolean) || ''
}

function firstNumber(...values) {
  for (const value of values) {
    const parsed = number(value)
    if (parsed !== null) return parsed
  }
  return null
}

function featureKey(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function addFeature(features, key, enabled) {
  const normalized = featureKey(key)
  if (enabled && normalized) features.add(normalized)
}

function parkingBaysFromForm(form = {}) {
  const explicit = firstNumber(form.parkingBays, form.parking_bays)
  if (explicit !== null) return explicit
  const covered = firstNumber(form.parkingCovered, form.coveredParking, form.garages)
  const open = firstNumber(form.parkingOpen, form.openParking)
  if (covered === null && open === null) return null
  return (covered || 0) + (open || 0)
}

function descriptionFromForm(form = {}) {
  const conditionParts = [
    firstText(form.propertyCondition),
    firstText(form.kitchenCondition),
    firstText(form.bathroomCondition),
  ].filter(Boolean)
  const notes = firstText(form.propertyDescription, form.description, form.propertyNotes, form.listingPreviewDescription)
  if (notes) return notes
  if (!conditionParts.length) return ''
  return `Condition: ${conditionParts.join(', ')}`
}

export function buildSellerOnboardingPublicationDraft({
  listing = {},
  formData = {},
  canonicalFacts = {},
} = {}) {
  const form = object(formData)
  const facts = Object.keys(object(canonicalFacts)).length
    ? object(canonicalFacts)
    : object(form.canonicalSellerFacts || form.canonicalFacts)
  const flow = resolveSellerOnboardingFlow(form, listing, facts)
  const propertyFacts = object(facts.property)
  const transactionFacts = object(facts.transaction)
  const complianceFacts = object(facts.compliance)
  const propertyBranch = flow.property_branch
  const propertyAddressDetails = normalizePropertyAddress(
    {
      propertyAddressDetails: form.propertyAddressDetails || propertyFacts.address_details || {},
      propertyAddress: form.propertyAddress || propertyFacts.address || '',
      propertyAddressLine1: form.propertyAddressLine1 || propertyFacts.address_line_1 || '',
      propertyAddressLine2: form.propertyAddressLine2 || propertyFacts.address_line_2 || '',
      suburb: form.suburb || propertyFacts.suburb || '',
      city: form.city || propertyFacts.city || '',
      province: form.province || propertyFacts.province || '',
      postalCode: form.postalCode || propertyFacts.postal_code || '',
      municipality: form.municipality || propertyFacts.municipality || '',
      country: form.country || propertyFacts.country || '',
    },
    listing,
    {
      line1: listing.addressLine1 || listing.address_line_1 || listing.propertyAddress || '',
      line2: listing.addressLine2 || listing.address_line_2 || '',
      suburb: listing.suburb || '',
      city: listing.city || '',
      province: listing.province || '',
      postalCode: listing.postalCode || listing.postal_code || '',
      municipality: listing.municipality || listing.city || '',
      country: listing.country || 'South Africa',
      source: listing.addressLine1 || listing.address_line_1 || listing.propertyAddress ? 'listing' : 'manual',
    },
  )
  const propertyAddress = formatPropertyAddress(propertyAddressDetails)

  const features = new Set(
    Array.isArray(form.features)
      ? form.features.map(featureKey).filter(Boolean)
      : [],
  )
  addFeature(features, 'pool', bool(form.pool) || bool(form.swimmingPool) || bool(complianceFacts.swimming_pool))
  addFeature(features, 'electric_fence', bool(form.electricFence) || bool(complianceFacts.electric_fence))
  addFeature(features, 'solar', bool(form.solarInstallation) || bool(complianceFacts.solar_installation))
  addFeature(features, 'borehole', bool(form.borehole) || bool(complianceFacts.borehole))
  addFeature(features, 'gas_installation', bool(form.gasInstallation) || bool(complianceFacts.gas_installation))
  addFeature(features, 'estate_or_hoa', bool(form.estateOrHoa) || bool(propertyFacts.estate_or_hoa) || propertyBranch === 'estate_hoa')
  addFeature(features, 'sectional_title', bool(form.sectionalTitle) || bool(propertyFacts.sectional_title) || propertyBranch === 'sectional_title')

  return {
    title: firstText(
      form.listingTitle,
      propertyAddressDetails.line1,
      propertyAddress,
      propertyFacts.address,
      listing.title,
      listing.listingTitle,
      listing.addressLine1,
    ),
    address: propertyAddress,
    addressLine1: propertyAddressDetails.line1,
    addressLine2: propertyAddressDetails.line2,
    suburb: firstText(propertyAddressDetails.suburb, form.suburb, propertyFacts.suburb, listing.suburb),
    city: firstText(propertyAddressDetails.city, form.city, propertyFacts.city, listing.city),
    province: firstText(propertyAddressDetails.province, form.province, propertyFacts.province, listing.province),
    postalCode: firstText(propertyAddressDetails.postalCode, form.postalCode, propertyFacts.postal_code, listing.postalCode, listing.postal_code),
    municipality: firstText(propertyAddressDetails.municipality, form.municipality, propertyFacts.municipality, listing.municipality, listing.city),
    country: propertyAddressDetails.country || 'South Africa',
    addressSource: propertyAddressDetails.source,
    addressFormatted: propertyAddressDetails.formatted,
    propertyType: firstText(form.propertyType, propertyFacts.property_type, listing.propertyType),
    listingType: 'Sale',
    askingPrice: firstNumber(form.askingPrice, transactionFacts.asking_price, listing.askingPrice, listing.estimatedValue),
    bedrooms: firstNumber(form.bedrooms),
    bathrooms: firstNumber(form.bathrooms),
    garages: firstNumber(form.garages),
    parkingBays: parkingBaysFromForm(form),
    floorSize: firstNumber(form.floorSize, propertyFacts.floor_size),
    erfSize: firstNumber(form.erfSize, propertyFacts.erf_size),
    ratesTaxes: firstNumber(form.ratesTaxes, propertyFacts.rates_taxes),
    levies: firstNumber(form.levies, propertyFacts.levies),
    description: descriptionFromForm(form),
    features: Array.from(features),
    amenities: [],
    addressDetails: {
      query: propertyAddressDetails.query,
      line1: propertyAddressDetails.line1,
      line2: propertyAddressDetails.line2,
      suburb: propertyAddressDetails.suburb,
      city: propertyAddressDetails.city,
      province: propertyAddressDetails.province,
      postalCode: propertyAddressDetails.postalCode,
      municipality: propertyAddressDetails.municipality,
      country: propertyAddressDetails.country,
      placeId: propertyAddressDetails.placeId,
      source: propertyAddressDetails.source,
      formatted: propertyAddressDetails.formatted,
    },
    status: 'Draft',
  }
}

export function mergePublicationDraft(existing = {}, draft = {}) {
  const next = {}
  for (const [key, value] of Object.entries(draft || {})) {
    const current = existing?.[key]
    if (Array.isArray(value)) {
      next[key] = Array.isArray(current) && current.length ? current : value
    } else if (isPlainObject(value)) {
      next[key] = isPlainObject(current) && Object.keys(current).length ? current : value
    } else if (typeof value === 'number') {
      next[key] = number(current) === null ? value : number(current)
    } else {
      next[key] = text(current) || value || null
    }
  }
  next.status = text(existing?.status) || text(draft?.status) || 'Draft'
  return next
}
