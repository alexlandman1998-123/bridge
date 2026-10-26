const text = value => String(value ?? '').trim().replace(/\s+/g, ' ')
export const buyerLocationKey = value => text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

function unique(values) {
  const labels = new Map()
  for (const value of values.filter(Boolean)) if (!labels.has(buyerLocationKey(value))) labels.set(buyerLocationKey(value), text(value))
  return [...labels.values()].sort((a, b) => a.localeCompare(b))
}

export function readBuyerMatchLocation(listing = {}) {
  if ([listing.sourceAuthority, listing.listingOptionSourceAuthority].includes('lead_projection')) return { city: '', suburb: '', province: '' }
  const source = listing.sourceListing || {}
  const sources = [listing, source, listing.propertyDetails, source.propertyDetails, listing.addressParts, source.addressParts,
    listing.sellerOnboarding?.formData, source.sellerOnboarding?.formData].filter(Boolean)
  const field = name => sources.map(row => text(row[name] || row[`property${name[0].toUpperCase()}${name.slice(1)}`])).find(Boolean) || ''
  return { city: field('city'), suburb: field('suburb'), province: field('province') }
}

export function buildBuyerMatchLocationOptions(listings = [], city = '') {
  const locations = listings.map(readBuyerMatchLocation)
  return {
    cities: unique(locations.map(row => row.city)),
    suburbs: unique(locations.filter(row => !city || buyerLocationKey(row.city) === buyerLocationKey(city)).map(row => row.suburb)),
  }
}

export function resolveBuyerMatchLocationDefaults({ preferredAreas = '', enquiryListing = null, listings = [] } = {}) {
  const locations = listings.map(readBuyerMatchLocation)
  const options = buildBuyerMatchLocationOptions(listings)
  const tokens = (Array.isArray(preferredAreas) ? preferredAreas : String(preferredAreas || '').split(/[,;\n|]/)).map(text).filter(Boolean)
  const ignored = new Set([...locations.map(row => buyerLocationKey(row.province)), 'south africa', 'za'])
  const preferred = tokens.filter(value => !ignored.has(buyerLocationKey(value)))
  if (!preferred.length) {
    const location = readBuyerMatchLocation(enquiryListing || {})
    return { city: location.city, suburbs: location.suburb ? [location.suburb] : [] }
  }
  const preferredCity = preferred.map(value => options.cities.find(city => buyerLocationKey(city) === buyerLocationKey(value))).find(Boolean) || ''
  const suburbs = unique(preferred.filter(value => !options.cities.some(city => buyerLocationKey(city) === buyerLocationKey(value))))
  const suburbCities = unique(locations.filter(row => suburbs.some(suburb => buyerLocationKey(row.suburb) === buyerLocationKey(suburb))).map(row => row.city))
  return { city: preferredCity || (suburbCities.length === 1 ? suburbCities[0] : ''), suburbs }
}

export function matchesBuyerLocation(location = {}, { city = '', suburbs = [] } = {}) {
  if (city && buyerLocationKey(location.city) !== buyerLocationKey(city)) return false
  return !suburbs.length || suburbs.some(suburb => buyerLocationKey(suburb) === buyerLocationKey(location.suburb))
}

// Automatic recommendations need a known search area; never fall back to price alone.
export function filterAutomaticBuyerMatches(recommendations = [], location = {}) {
  if (!location.city && !location.suburbs?.length) return []
  return recommendations.filter(recommendation => matchesBuyerLocation(recommendation, location))
}
