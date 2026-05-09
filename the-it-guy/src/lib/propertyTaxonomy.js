export const PROPERTY_CATEGORIES = [
  'residential',
  'commercial',
  'industrial',
  'retail',
  'agricultural',
  'mixed_use',
  'vacant_land',
]

export const LISTING_SOURCES = [
  'private_listing',
  'development',
  'manual_stock',
  'imported_stock',
]

export const PROPERTY_STRUCTURE_TYPES = [
  'full_title',
  'sectional_title',
  'estate',
  'share_block',
  'freehold',
  'agricultural_holding',
  'other',
]

export const PROPERTY_TYPES_BY_CATEGORY = {
  residential: ['house', 'apartment', 'townhouse', 'cluster', 'duplex', 'penthouse', 'vacant_stand'],
  commercial: ['office_building', 'medical_suite', 'business_park', 'commercial_building'],
  industrial: ['warehouse', 'factory', 'distribution_centre', 'industrial_park'],
  retail: ['retail_store', 'showroom', 'shopping_centre'],
  agricultural: ['farm', 'smallholding', 'agricultural_land'],
  mixed_use: ['mixed_use_building', 'mixed_use_estate'],
  vacant_land: ['vacant_land', 'vacant_stand'],
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

export function getPropertyCategoryLabel(category) {
  const key = normalizePropertyCategory(category)
  const labels = {
    residential: 'Residential',
    commercial: 'Commercial',
    industrial: 'Industrial',
    retail: 'Retail',
    agricultural: 'Agricultural',
    mixed_use: 'Mixed Use',
    vacant_land: 'Vacant Land',
  }
  return labels[key] || 'Residential'
}

export function getListingSourceLabel(source) {
  const key = normalizeListingSource(source)
  const labels = {
    private_listing: 'Private Listings',
    development: 'Developments',
    manual_stock: 'Manual Stock',
    imported_stock: 'Imported Stock',
  }
  return labels[key] || 'Private Listings'
}

export function getPropertyStructureTypeLabel(type) {
  const key = normalizePropertyStructureType(type)
  const labels = {
    full_title: 'Full Title',
    sectional_title: 'Sectional Title',
    estate: 'Estate',
    share_block: 'Share Block',
    freehold: 'Freehold',
    agricultural_holding: 'Agricultural Holding',
    other: 'Other',
  }
  return labels[key] || 'Other'
}

export function mapLegacyPropertyTypeToCategory(value, { fallback = null } = {}) {
  const normalized = normalizeKey(value)
  if (!normalized) return fallback

  if (
    normalized.includes('development') ||
    normalized.includes('residential') ||
    normalized.includes('house') ||
    normalized.includes('apartment') ||
    normalized.includes('townhouse') ||
    normalized.includes('cluster') ||
    normalized.includes('duplex') ||
    normalized.includes('penthouse')
  ) {
    return 'residential'
  }
  if (normalized.includes('industrial') || normalized.includes('warehouse') || normalized.includes('factory')) {
    return 'industrial'
  }
  if (normalized.includes('retail') || normalized.includes('showroom') || normalized.includes('shopping')) {
    return 'retail'
  }
  if (normalized.includes('agric') || normalized.includes('farm') || normalized.includes('smallholding')) {
    return 'agricultural'
  }
  if (normalized.includes('mixed use') || normalized.includes('mixed_use') || normalized.includes('mixed-use')) {
    return 'mixed_use'
  }
  if (
    normalized.includes('vacant land') ||
    normalized === 'land' ||
    normalized.includes('vacant stand') ||
    normalized.includes('vacant')
  ) {
    return 'vacant_land'
  }
  if (normalized.includes('commercial') || normalized.includes('office') || normalized.includes('business')) {
    return 'commercial'
  }
  return fallback
}

export function mapLegacyValueToStructureType(value, { fallback = null } = {}) {
  const normalized = normalizeKey(value)
  if (!normalized) return fallback

  if (normalized.includes('sectional')) return 'sectional_title'
  if (normalized.includes('full title') || normalized.includes('full_title')) return 'full_title'
  if (normalized.includes('freehold')) return 'freehold'
  if (normalized.includes('estate')) return 'estate'
  if (normalized.includes('share block') || normalized.includes('share_block')) return 'share_block'
  if (normalized.includes('agricultural holding') || normalized.includes('agricultural_holding')) return 'agricultural_holding'
  if (normalized.includes('other')) return 'other'

  return fallback
}

export function normalizePropertyCategory(value, { fallback = null } = {}) {
  const normalized = normalizeKey(value)
  if (PROPERTY_CATEGORIES.includes(normalized)) return normalized
  return mapLegacyPropertyTypeToCategory(normalized, { fallback })
}

export function normalizeListingSource(value, { fallback = null } = {}) {
  const normalized = normalizeKey(value)
  if (LISTING_SOURCES.includes(normalized)) return normalized
  if (normalized === 'private' || normalized.includes('private listing')) return 'private_listing'
  if (normalized.includes('development') || normalized === 'developer_sale') return 'development'
  if (normalized.includes('manual')) return 'manual_stock'
  if (normalized.includes('import')) return 'imported_stock'
  return fallback
}

export function normalizePropertyStructureType(value, { fallback = null } = {}) {
  const normalized = normalizeKey(value)
  if (PROPERTY_STRUCTURE_TYPES.includes(normalized)) return normalized
  return mapLegacyValueToStructureType(normalized, { fallback })
}

