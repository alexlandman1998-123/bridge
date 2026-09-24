import { normalizeProperty24Text } from './client.js'
import { toProperty24Integer } from './mapper.js'
import { buildListingAddressFingerprint } from '../services/listingPortalAddressProtectionService.js'

function normalizeLocationPart(value = '') {
  return normalizeProperty24Text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function firstText(...values) {
  for (const value of values) {
    const text = normalizeProperty24Text(value)
    if (text) return text
  }
  return ''
}

function locationError(code, message, details = {}) {
  const error = new Error(message)
  error.code = code
  error.status = 422
  error.details = details
  return error
}

async function fetchOptionalListingPublication(supabase, listingId) {
  const { data, error } = await supabase
    .from('listing_publication_data')
    .select('*')
    .eq('listing_id', listingId)
    .maybeSingle()
  if (error && !['42P01', 'PGRST116', 'PGRST205'].includes(error.code)) throw error
  return data || {}
}

async function fetchOptionalListingOnboarding(supabase, listingId) {
  const { data, error } = await supabase
    .from('private_listing_seller_onboarding')
    .select('form_data')
    .eq('private_listing_id', listingId)
    .maybeSingle()
  if (error && !['42P01', 'PGRST116', 'PGRST205'].includes(error.code)) throw error
  return data?.form_data || {}
}

export async function resolveProperty24ListingLocation({
  supabase,
  property24,
  listingId,
  suppliedSuburbId = '',
} = {}) {
  if (!supabase) throw new Error('Supabase client is required.')
  if (!property24?.findSuburb) throw new Error('Property24 suburb lookup is required.')
  const normalizedListingId = normalizeProperty24Text(listingId)
  if (!normalizedListingId) throw new Error('listingId is required.')

  const [{ data: listing, error: listingError }, publication, onboarding] = await Promise.all([
    supabase.from('private_listings').select('*').eq('id', normalizedListingId).single(),
    fetchOptionalListingPublication(supabase, normalizedListingId),
    fetchOptionalListingOnboarding(supabase, normalizedListingId),
  ])
  if (listingError) throw listingError

  const canonicalFacts = listing.seller_canonical_facts_json || listing.sellerCanonicalFacts || {}
  const canonicalLocation = canonicalFacts.property24Location || canonicalFacts.property24_location || {}
  const propertyDetails = listing.property_details || listing.propertyDetails || {}

  const expected = {
    countryName: firstText(publication.country, listing.country, propertyDetails.country, onboarding.country, canonicalLocation.country, 'South Africa'),
    provinceName: firstText(publication.province, listing.province, propertyDetails.province, onboarding.province, canonicalLocation.province),
    cityName: firstText(publication.city, publication.town, listing.city, listing.town, propertyDetails.city, propertyDetails.town, onboarding.city, onboarding.town, canonicalLocation.city),
    suburbName: firstText(publication.suburb, listing.suburb, propertyDetails.suburb, onboarding.suburb, canonicalLocation.suburb),
  }
  const missing = Object.entries(expected).filter(([, value]) => !value).map(([key]) => key)
  if (missing.length) {
    throw locationError(
      'property24_location_incomplete',
      `Complete the listing suburb, city and province before publishing to Property24. Missing: ${missing.join(', ')}.`,
      { expected, missing },
    )
  }

  const lookup = await property24.findSuburb(expected)
  const suburb = lookup?.data?.suburb
  if (lookup?.data?.found === false || !suburb?.id) {
    throw locationError(
      'property24_suburb_not_found',
      `Property24 could not find ${expected.suburbName}, ${expected.cityName}, ${expected.provinceName}.`,
      { expected },
    )
  }

  const suburbNames = [suburb.name, ...(Array.isArray(suburb.alternateNames) ? suburb.alternateNames : [])]
    .map(normalizeLocationPart)
    .filter(Boolean)
  const exactMatch = suburbNames.includes(normalizeLocationPart(expected.suburbName)) &&
    normalizeLocationPart(suburb.cityName) === normalizeLocationPart(expected.cityName) &&
    normalizeLocationPart(suburb.provinceName) === normalizeLocationPart(expected.provinceName)
  if (!exactMatch) {
    throw locationError(
      'property24_suburb_mismatch',
      `Property24 resolved the listing to ${suburb.name}, ${suburb.cityName}, ${suburb.provinceName}, not ${expected.suburbName}, ${expected.cityName}, ${expected.provinceName}.`,
      { expected, resolved: suburb },
    )
  }

  const resolvedSuburbId = toProperty24Integer(suburb.id)
  const requestedSuburbId = toProperty24Integer(suppliedSuburbId)
  if (requestedSuburbId && requestedSuburbId !== resolvedSuburbId) {
    throw locationError(
      'property24_suburb_id_stale',
      `The saved Property24 suburb ID ${requestedSuburbId} does not match ${suburb.name}, ${suburb.cityName} (ID ${resolvedSuburbId}). Check the address and preview again.`,
      { expected, resolved: suburb, requestedSuburbId },
    )
  }

  return {
    suburbId: resolvedSuburbId,
    suburb: normalizeProperty24Text(suburb.name),
    city: normalizeProperty24Text(suburb.cityName),
    province: normalizeProperty24Text(suburb.provinceName),
    country: normalizeProperty24Text(suburb.countryName || expected.countryName),
    label: `${normalizeProperty24Text(suburb.name)}, ${normalizeProperty24Text(suburb.cityName)}`,
    source: 'property24_exact_catalog_lookup',
    verified: true,
    addressFingerprint: buildListingAddressFingerprint({ listing, publication }),
  }
}
