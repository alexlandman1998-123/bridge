import { RENTAL_PORTAL_FIELDS } from '../rentals/rentalPortalFieldCatalog.js'

export function listingPublicationIssueTarget(code = '', { rental = false } = {}) {
  const field = (field, step) => ({ field, step })
  if (code.startsWith('invalid_rental_field:')) {
    const item = RENTAL_PORTAL_FIELDS.find((item) => item.key === code.slice('invalid_rental_field:'.length))
    if (!item) return null
    const key = item.formKey || (item.derivedFrom === 'availableFrom' ? 'availableFrom' : item.key)
    if (item.key === 'propertyInfo.propertyDescription.propertyDescriptionType') return field('rentalTitleType', 'property')
    return field(key, ['bedrooms', 'bathrooms', 'garages', 'parkingBays', 'unitNumber', 'complexName'].includes(key) ? 'property' : item.derivedFrom === 'availableFrom' || key === 'furnishedStatus' ? 'terms' : 'features')
  }
  if (/agency|branch_guid|agent.*(id|mapping)|credential|runtime_secret|config|go_live|production_approval|live_publish|allowlist|pilot|sandbox|activated_address/.test(code)) return null
  if (/expiry/.test(code)) return field('property24ExpiryDate', rental ? 'terms' : 'expiry')
  if (/image|photo/.test(code)) return field(rental ? 'galleryImages' : 'listingImages', 'marketing')
  if (/description/.test(code)) return field(rental ? 'description' : 'listingDescription', 'marketing')
  if (/marketing_title/.test(code)) return field(rental ? 'title' : 'listingTitle', 'marketing')
  if (/house_share/.test(code)) return field('rentalMandateType', 'terms')
  if (/rental_price_frequency/.test(code)) return field('rentalPriceFrequency', 'terms')
  if (/rental_rate|monthly_rent|price_or_poa|invalid_price/.test(code)) return field(rental ? 'monthlyRent' : 'listingPrice', rental ? 'terms' : 'property')
  if (/available_from/.test(code)) return field('availableFrom', 'terms')
  if (/private_property_(rates|levies)_/.test(code) && rental) {
    const item = RENTAL_PORTAL_FIELDS.find((item) => item.pp === (code.includes('_rates_') ? 'Rates' : 'Levies'))
    return item ? field(code.includes('requires_total_price') ? item.key.replace(/amount$/, 'unit') : item.key, 'features') : null
  }
  if (/street_number/.test(code)) return field('streetNumber', 'property')
  if (/street_name/.test(code)) return field('streetName', 'property')
  if (/suburb|location/.test(code)) return field('suburb', 'property')
  if (/town/.test(code)) return field('city', 'property')
  if (/province/.test(code)) return field('province', 'property')
  if (/address/.test(code)) return field('propertyAddress', 'property')
  if (/gross_lettable/.test(code)) {
    const item = rental ? RENTAL_PORTAL_FIELDS.find((item) => /grossLettableArea/.test(item.key)) : null
    return rental ? (item ? field(item.formKey || item.key, 'features') : null) : field('grossLettableArea', 'features')
  }
  if (/sale_terms/.test(code)) return field('listingTerms', 'features')
  if (/zoning/.test(code)) return field(rental ? 'propertyInfo.zoneType' : 'zoning', 'features')
  if (/commercial_parking/.test(code)) return field(rental ? 'parkingBays' : 'parking', rental ? 'property' : 'features')
  if (/mapping_not_verified|not_supported|category_unclassified/.test(code)) return field('propertyCategory', 'property')
  if (/property_type|home_type|business_type|farm_type/.test(code)) return field('propertyType', 'property')
  if (/bedroom/.test(code)) return field('bedrooms', 'property')
  if (/bathroom/.test(code)) return field('bathrooms', 'property')
  if (/garage/.test(code)) return field('garages', 'property')
  if (/floor/.test(code)) return field('floorSize', 'property')
  if (/land_area|erf/.test(code)) return field('erfSize', 'property')
  if (/furnished/.test(code)) return field('furnishedStatus', rental ? 'terms' : 'features')
  if (/pets/.test(code)) return field(rental ? 'feature.pet_friendly' : 'feature-pet_friendly', 'features')
  for (const key of ['garden', 'pool', 'flatlet']) if (code.includes(key)) return field(rental ? key : `feature-${key}`, 'features')
  return null
}

export function publicationReadinessCodes(payload = {}) {
  const preview = payload.preview || payload.readiness?.preview || payload.report?.preview || {}
  const arrays = [payload.missingConfiguration, preview.dataBlockers, preview.technicalBlockers, payload.readiness?.blockers, payload.report?.readiness?.blockers, payload.report?.blockers]
  return [...new Set(arrays.flatMap((items) => Array.isArray(items) ? items : []).filter((item) => typeof item === 'string'))]
}

export function listingIssueEditorUrl(path, issue, message = '', { publicationScope = false } = {}) {
  const params = new URLSearchParams({ step: issue.step, field: issue.field })
  if (message) params.set('issue', message)
  if (publicationScope) params.set('scope', 'listing-publication')
  return `${path}?${params}`
}
