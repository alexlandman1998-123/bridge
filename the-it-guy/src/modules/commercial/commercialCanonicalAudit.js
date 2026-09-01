import { evaluateCommercialListingReadiness } from './commercialListingReadiness.js'

export const COMMERCIAL_CANONICAL_AUDIT_VERSION = 'arch9_commercial_canonical_audit_v1'

const LISTING_TERM_KEYS = {
  operating_costs: ['lease_terms', 'operating_costs'],
  rates_and_taxes: ['lease_terms', 'rates_and_taxes'],
  lease_term_months: ['lease_terms', 'lease_term'],
  deposit_amount: ['lease_terms', 'deposit_amount'],
  utility_policy: ['lease_terms', 'utility_policy'],
}

const PROPERTY_FACT_KEYS = {
  gross_lettable_area: 'gla_m2',
  available_area: 'available_space_m2',
  zoning_land_use_rights: 'zoning',
  parking_ratio: 'parking_ratio',
  loading_bays: 'loading_bays',
  power_supply: 'power_supply',
  yard_size: 'yard_size_m2',
  roller_shutter_doors: 'roller_doors',
  truck_access: 'truck_access',
  sprinkler_system: 'sprinklers',
  crane_capacity: 'crane_capacity',
  farm_size: 'farm_size_ha',
  boreholes: 'water_supply',
  water_rights: 'water_rights',
  irrigation: 'irrigation',
  current_agricultural_use: 'agricultural_use',
  development_rights: 'development_rights',
  subdivision_status: 'subdivision_status',
  bulk: 'bulk',
  coverage: 'coverage',
  services_available: 'services_available',
  environmental_status: 'environmental_status',
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== ''
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function nestedValue(source = {}, [group, key]) {
  return object(object(source)[group])[key]
}

function termFindings(listing = {}) {
  const metadata = object(listing.metadata_json)
  const duplicates = []
  const candidates = []

  Object.entries(LISTING_TERM_KEYS).forEach(([column, path]) => {
    const legacy = nestedValue(metadata, path)
    if (!hasValue(legacy)) return
    if (hasValue(listing[column])) duplicates.push(column)
    else candidates.push(column)
  })

  const saleRates = nestedValue(metadata, ['sale_terms', 'rates_and_taxes'])
  if (hasValue(saleRates)) {
    if (hasValue(listing.rates_and_taxes)) duplicates.push('rates_and_taxes')
    else candidates.push('rates_and_taxes')
  }

  return {
    duplicateListingTerms: Array.from(new Set(duplicates)),
    legacyListingTermCandidates: Array.from(new Set(candidates)),
  }
}

function propertyFindings(listing = {}, property = {}) {
  const attributes = object(object(listing.metadata_json).commercial_attributes)
  const saleTerms = object(object(listing.metadata_json).sale_terms)
  const duplicates = []
  const candidates = []

  Object.entries(PROPERTY_FACT_KEYS).forEach(([legacyKey, column]) => {
    if (!hasValue(attributes[legacyKey])) return
    const canonicalPresent = typeof property[column] === 'boolean' ? property[column] === true : hasValue(property[column])
    if (canonicalPresent) duplicates.push(column)
    else candidates.push(column)
  })

  if (hasValue(saleTerms.erf_size)) {
    if (hasValue(property.land_size_m2)) duplicates.push('land_size_m2')
    else candidates.push('land_size_m2')
  }

  return {
    duplicatePropertyFacts: duplicates,
    legacyPropertyFactCandidates: candidates,
  }
}

export function buildCommercialCanonicalAudit({ listings = [], properties = [] } = {}) {
  const propertiesById = new Map((properties || []).map((property) => [property.id, property]))
  const findings = (listings || []).map((listing) => {
    const property = propertiesById.get(listing.property_id) || null
    const readiness = evaluateCommercialListingReadiness({ listing, property: property || {} })
    const terms = termFindings(listing)
    const propertyFacts = propertyFindings(listing, property || {})
    const issues = [
      ...(property ? [] : ['missing_linked_property']),
      ...readiness.missingFacts.map((fact) => `missing_${fact}`),
      ...terms.duplicateListingTerms.map((field) => `duplicate_listing_${field}`),
      ...terms.legacyListingTermCandidates.map((field) => `legacy_listing_${field}`),
      ...propertyFacts.duplicatePropertyFacts.map((field) => `duplicate_property_${field}`),
      ...propertyFacts.legacyPropertyFactCandidates.map((field) => `legacy_property_${field}`),
    ]

    return {
      listingId: listing.id || null,
      propertyId: listing.property_id || null,
      category: readiness.category,
      readiness,
      ...terms,
      ...propertyFacts,
      issues,
      status: issues.length ? 'needs_review' : 'canonical',
    }
  })

  const countsByCategory = findings.reduce((counts, finding) => {
    const current = counts[finding.category] || { total: 0, canonical: 0, needsReview: 0 }
    current.total += 1
    if (finding.status === 'canonical') current.canonical += 1
    else current.needsReview += 1
    counts[finding.category] = current
    return counts
  }, {})

  const canonicalCount = findings.filter((finding) => finding.status === 'canonical').length
  return {
    version: COMMERCIAL_CANONICAL_AUDIT_VERSION,
    status: findings.some((finding) => finding.issues.length) ? 'needs_review' : 'canonical',
    summary: {
      listingCount: findings.length,
      canonicalCount,
      needsReviewCount: findings.length - canonicalCount,
      missingLinkedPropertyCount: findings.filter((finding) => finding.issues.includes('missing_linked_property')).length,
      duplicateCount: findings.reduce((count, finding) => count + finding.issues.filter((issue) => issue.startsWith('duplicate_')).length, 0),
      legacyCandidateCount: findings.reduce((count, finding) => count + finding.issues.filter((issue) => issue.startsWith('legacy_')).length, 0),
      countsByCategory,
    },
    findings,
    property24Publishing: 'still_blocked_pending_verified_non_residential_schema',
  }
}
