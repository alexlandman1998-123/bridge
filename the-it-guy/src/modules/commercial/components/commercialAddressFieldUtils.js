export const COMMERCIAL_ADDRESS_COLUMNS = [
  'formatted_address',
  'street_number',
  'route',
  'street_name',
  'street_address',
  'suburb',
  'city',
  'province',
  'postal_code',
  'country',
  'latitude',
  'longitude',
  'place_id',
  'google_place_id',
  'address_components',
  'raw_google_response',
  'geocoding_status',
]

export const DEFAULT_COMMERCIAL_ADDRESS_MAPPING = {
  formattedAddress: 'formatted_address',
  streetNumber: 'street_number',
  route: 'route',
  streetName: 'street_name',
  streetAddress: 'street_address',
  suburb: 'suburb',
  city: 'city',
  province: 'province',
  postalCode: 'postal_code',
  country: 'country',
  latitude: 'latitude',
  longitude: 'longitude',
  placeId: 'place_id',
  googlePlaceId: 'google_place_id',
  addressComponents: 'address_components',
  rawGoogleResponse: 'raw_google_response',
  geocodingStatus: 'geocoding_status',
}

function normalizeText(value) {
  return String(value || '').trim()
}

function firstText(...values) {
  for (const value of values) {
    const normalized = normalizeText(value)
    if (normalized) return normalized
  }
  return ''
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function pick(record = {}, key = '') {
  if (!key) return ''
  return record?.[key]
}

export function buildCommercialAddressValue(record = {}, mapping = DEFAULT_COMMERCIAL_ADDRESS_MAPPING, fallbackField = '') {
  const resolvedMapping = { ...DEFAULT_COMMERCIAL_ADDRESS_MAPPING, ...(mapping || {}) }
  const source = record && typeof record === 'object' ? record : {}
  const formattedAddress = firstText(
    source.formattedAddress,
    source.formatted_address,
    source.formatted,
    pick(source, resolvedMapping.formattedAddress),
    pick(source, resolvedMapping.streetAddress),
    fallbackField ? pick(source, fallbackField) : '',
    source.address,
    source.location,
    source.current_location,
  )
  const placeId = firstText(
    source.placeId,
    source.place_id,
    source.googlePlaceId,
    source.google_place_id,
    pick(source, resolvedMapping.placeId),
    pick(source, resolvedMapping.googlePlaceId),
  )

  if (!formattedAddress && !placeId) return null

  return {
    formattedAddress,
    streetNumber: firstText(source.streetNumber, source.street_number, pick(source, resolvedMapping.streetNumber)),
    route: firstText(source.route, pick(source, resolvedMapping.route)),
    streetName: firstText(source.streetName, source.street_name, pick(source, resolvedMapping.streetName), source.route),
    streetAddress: firstText(source.streetAddress, source.street_address, pick(source, resolvedMapping.streetAddress), formattedAddress),
    suburb: firstText(source.suburb, source.locality, pick(source, resolvedMapping.suburb)),
    city: firstText(source.city, pick(source, resolvedMapping.city)),
    province: firstText(source.province, pick(source, resolvedMapping.province)),
    postalCode: firstText(source.postalCode, source.postal_code, pick(source, resolvedMapping.postalCode)),
    country: firstText(source.country, pick(source, resolvedMapping.country)),
    latitude: numberOrNull(source.latitude ?? pick(source, resolvedMapping.latitude)) ?? undefined,
    longitude: numberOrNull(source.longitude ?? pick(source, resolvedMapping.longitude)) ?? undefined,
    placeId,
    googlePlaceId: placeId,
    addressComponents: source.addressComponents || source.address_components || pick(source, resolvedMapping.addressComponents) || null,
    rawGoogleResponse: source.rawGoogleResponse || source.raw_google_response || pick(source, resolvedMapping.rawGoogleResponse) || null,
    geocodingStatus: firstText(source.geocodingStatus, source.geocoding_status, pick(source, resolvedMapping.geocodingStatus)) || (placeId ? 'google_place' : 'manual'),
  }
}

export function buildManualCommercialAddressValue(text = '', existing = null) {
  const formattedAddress = normalizeText(text)
  if (!formattedAddress) return null
  return {
    ...(existing || {}),
    formattedAddress,
    streetAddress: existing?.streetAddress || formattedAddress,
    placeId: '',
    googlePlaceId: '',
    geocodingStatus: existing?.placeId || existing?.googlePlaceId ? 'edited' : 'manual',
  }
}

export function serializeCommercialAddressValue(value = null, mapping = DEFAULT_COMMERCIAL_ADDRESS_MAPPING) {
  const resolvedMapping = { ...DEFAULT_COMMERCIAL_ADDRESS_MAPPING, ...(mapping || {}) }
  const source = value && typeof value === 'object' ? value : buildManualCommercialAddressValue(value)
  if (!source) return {}

  const placeId = firstText(source.googlePlaceId, source.placeId)
  const payload = {}
  const assign = (target, nextValue) => {
    if (!target) return
    payload[target] = nextValue
  }

  assign(resolvedMapping.formattedAddress, normalizeText(source.formattedAddress) || null)
  assign(resolvedMapping.streetNumber, normalizeText(source.streetNumber) || null)
  assign(resolvedMapping.route, normalizeText(source.route) || null)
  assign(resolvedMapping.streetName, normalizeText(source.streetName || source.route) || null)
  assign(resolvedMapping.streetAddress, normalizeText(source.streetAddress || source.formattedAddress) || null)
  assign(resolvedMapping.suburb, normalizeText(source.suburb) || null)
  assign(resolvedMapping.city, normalizeText(source.city) || null)
  assign(resolvedMapping.province, normalizeText(source.province) || null)
  assign(resolvedMapping.postalCode, normalizeText(source.postalCode) || null)
  assign(resolvedMapping.country, normalizeText(source.country) || null)
  assign(resolvedMapping.latitude, numberOrNull(source.latitude))
  assign(resolvedMapping.longitude, numberOrNull(source.longitude))
  assign(resolvedMapping.placeId, placeId || null)
  assign(resolvedMapping.googlePlaceId, placeId || null)
  assign(resolvedMapping.addressComponents, Array.isArray(source.addressComponents) ? source.addressComponents : source.addressComponents || null)
  assign(resolvedMapping.rawGoogleResponse, source.rawGoogleResponse || null)
  assign(resolvedMapping.geocodingStatus, normalizeText(source.geocodingStatus) || (placeId ? 'google_place' : 'manual'))

  if (resolvedMapping.arrayField) {
    const area = normalizeText(source.suburb || source.city || source.formattedAddress)
    payload[resolvedMapping.arrayField] = area ? [area] : []
  }

  return payload
}

export function commercialAddressDisplay(value = null) {
  if (!value) return ''
  if (typeof value === 'string') return value
  return normalizeText(value.formattedAddress || value.streetAddress || value.suburb || value.city)
}
