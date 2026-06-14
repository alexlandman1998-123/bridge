const DEFAULT_COUNTRY = 'South Africa'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function firstText(...values) {
  for (const value of values) {
    const text = normalizeText(value)
    if (text) return text
  }
  return ''
}

function normalizeProvince(value = '') {
  const text = normalizeText(value)
  if (!text) return ''

  const normalized = text.toLowerCase().replace(/[\s-]+/g, '')
  const provinceMap = {
    wc: 'Western Cape',
    westerncape: 'Western Cape',
    ec: 'Eastern Cape',
    easterncape: 'Eastern Cape',
    nc: 'Northern Cape',
    northerncape: 'Northern Cape',
    fs: 'Free State',
    freestate: 'Free State',
    kzn: 'KwaZulu-Natal',
    kwazulunatal: 'KwaZulu-Natal',
    gauteng: 'Gauteng',
    gp: 'Gauteng',
    limpopo: 'Limpopo',
    lp: 'Limpopo',
    mpumalanga: 'Mpumalanga',
    mp: 'Mpumalanga',
    northwest: 'North West',
    nw: 'North West',
    northwestprovince: 'North West',
  }

  return provinceMap[normalized] || text
}

function pickRecord(source = {}, fallback = {}) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return fallback
  return source
}

export function createBlankPropertyAddress() {
  return {
    query: '',
    line1: '',
    line2: '',
    suburb: '',
    city: '',
    province: '',
    postalCode: '',
    municipality: '',
    country: DEFAULT_COUNTRY,
    placeId: '',
    source: 'manual',
    formatted: '',
  }
}

export function formatPropertyAddress(address = {}) {
  const record = pickRecord(address, {})
  const parts = [
    record.line1,
    record.line2,
    record.suburb,
    record.city,
    normalizeProvince(record.province),
    record.postalCode,
  ]
    .map(normalizeText)
    .filter(Boolean)

  if (parts.length) return parts.join(', ')

  return normalizeText(record.formatted || record.query)
}

export function normalizePropertyAddress(source = {}, listing = {}, fallback = {}) {
  const record = pickRecord(source?.propertyAddressDetails || source?.property_address_details || source?.addressDetails || source?.address_details, {})
  const flat = pickRecord(source, {})
  const listingRecord = pickRecord(listing, {})
  const fallbackRecord = pickRecord(fallback, {})

  const line1 = firstText(
    record.line1,
    record.line_1,
    record.addressLine1,
    record.address_line_1,
    flat.propertyAddressLine1,
    flat.addressLine1,
    flat.propertyAddress,
    fallbackRecord.line1,
    listingRecord.addressLine1,
    listingRecord.address_line_1,
    listingRecord.propertyAddress,
    listingRecord.address,
  )
  const line2 = firstText(
    record.line2,
    record.line_2,
    record.addressLine2,
    record.address_line_2,
    flat.propertyAddressLine2,
    flat.addressLine2,
    fallbackRecord.line2,
    listingRecord.addressLine2,
    listingRecord.address_line_2,
  )
  const suburb = firstText(
    record.suburb,
    record.suburb_name,
    flat.suburb,
    fallbackRecord.suburb,
    listingRecord.suburb,
  )
  const city = firstText(
    record.city,
    record.town,
    flat.city,
    fallbackRecord.city,
    listingRecord.city,
  )
  const province = firstText(
    record.province,
    record.region,
    flat.province,
    fallbackRecord.province,
    listingRecord.province,
  )
  const postalCode = firstText(
    record.postalCode,
    record.postal_code,
    flat.postalCode,
    flat.postal_code,
    fallbackRecord.postalCode,
    fallbackRecord.postal_code,
    listingRecord.postalCode,
    listingRecord.postal_code,
  )
  const municipality = firstText(
    record.municipality,
    record.local_municipality,
    flat.municipality,
    fallbackRecord.municipality,
    listingRecord.municipality,
    city,
  )
  const country = firstText(
    record.country,
    record.country_name,
    flat.country,
    fallbackRecord.country,
    listingRecord.country,
    DEFAULT_COUNTRY,
  ) || DEFAULT_COUNTRY
  const placeId = firstText(
    record.placeId,
    record.place_id,
    record.placeID,
    flat.propertyAddressPlaceId,
    flat.addressPlaceId,
    fallbackRecord.placeId,
    fallbackRecord.place_id,
  )
  const sourceLabel = firstText(
    record.source,
    flat.propertyAddressSource,
    flat.addressSource,
    fallbackRecord.source,
    line1 ? 'manual' : '',
  ) || 'manual'
  const formatted = formatPropertyAddress({
    line1,
    line2,
    suburb,
    city,
    province: normalizeProvince(province),
    postalCode,
  })
  const query = firstText(
    record.query,
    record.search_query,
    flat.propertyAddressSearch,
    flat.addressQuery,
    fallbackRecord.query,
    line1,
    formatted,
  )

  return {
    query,
    line1,
    line2,
    suburb,
    city,
    province: normalizeProvince(province),
    postalCode,
    municipality,
    country,
    placeId,
    source: sourceLabel,
    formatted,
  }
}

export function propertyAddressIsComplete(address = {}) {
  const record = pickRecord(address, {})
  return Boolean(record.line1 && record.suburb && record.city && record.province)
}
