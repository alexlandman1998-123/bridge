import {
  LISTING_FEATURE_CATALOG,
  normalizeListingFeatureFacts,
  resolveListingFeature,
} from '../../src/services/listings/listingFeatureCatalog.js'

function text(value = '') {
  return String(value ?? '').trim()
}

export function normalizeListingFeatureKey(value = '') {
  return text(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function number(...values) {
  for (const value of values) {
    if (value === null || value === undefined || text(value) === '') continue
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return numeric
  }
  return null
}

function boolean(value) {
  if (value === true || value === false) return value
  const key = normalizeListingFeatureKey(value)
  if (['yes', 'true', '1', 'y', 'allowed'].includes(key)) return true
  if (['no', 'false', '0', 'n', 'not_allowed'].includes(key)) return false
  return null
}

function featureValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value.key || value.value || value.label || value.name || value.type || ''
  }
  return value
}

function collectFeatureLabels(...sources) {
  const labels = []
  const visit = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    const label = text(featureValue(value))
    if (!label) return
    if (label.includes(',') && !value?.key) label.split(',').forEach(visit)
    else labels.push(label)
  }
  sources.forEach(visit)
  return [...new Map(labels.map((label) => [normalizeListingFeatureKey(label), label])).values()]
}

const FEATURE_DEFINITIONS = Object.freeze({
  flatlet: { label: 'Flatlet', aliases: ['flatlet', 'flatlet_second_dwelling', 'second_dwelling', 'granny_flat'] },
  staffQuarters: { label: 'Staff quarters', aliases: ['staff_quarters', 'staff_accommodation', 'domestic_quarters', 'staff_room', 'staff_rooms'] },
  garden: { label: 'Garden', aliases: ['garden'] },
  pool: { label: 'Pool', aliases: ['pool', 'swimming_pool'] },
  fibre: { label: 'Fibre', aliases: ['fibre', 'fiber', 'fibre_ready', 'fiber_ready', 'fibre_connectivity', 'fibre_internet'] },
  petFriendly: { label: 'Pet friendly', aliases: ['pet_friendly', 'pets_allowed', 'pet_friendly_property'] },
})

const DESCRIPTION_FEATURE_LABELS = Object.freeze({
  solar: 'Solar power',
  solar_installation: 'Solar power',
  solar_backup: 'Solar power',
  solar_and_inverter: 'Solar power',
  backup_power: 'Backup power',
  backup_water: 'Backup water',
  electric_fence: 'Electric fencing',
})

const NON_DESCRIPTIVE_FEATURE_KEYS = new Set([
  'price_on_application',
  'poa',
  'estate_or_hoa',
  'sectional_title',
  'on_auction',
  'reduced_banner',
  'no_transfer_duty',
  'furnished',
  'unfurnished',
  'semi_furnished',
  'subject_to_approval',
  'allowed',
  'not_allowed',
  'tenant_pays_utilities',
  'utilities_included',
  'water_included',
])

const DESCRIPTIVE_PORTAL_FLAGS = Object.freeze([
  ['accessGate', 'Access gate'],
  ['alarm', 'Alarm'],
  ['electricFencing', 'Electric fencing'],
  ['securityPost', 'Security post'],
  ['builtInCupboards', 'Built-in cupboards'],
  ['prepaidElectricity', 'Prepaid electricity'],
  ['prepaidWater', 'Prepaid water'],
  ['borehole', 'Borehole'],
  ['backupWater', 'Backup water'],
  ['solarBackup', 'Solar / inverter'],
  ['balcony', 'Balcony'],
  ['patio', 'Patio'],
  ['builtInBraai', 'Built-in braai'],
  ['clubhouse', 'Clubhouse'],
  ['gym', 'Gym'],
  ['laundry', 'Laundry'],
  ['scenicView', 'Scenic view'],
  ['satellite', 'Satellite'],
])

function selectedFeature(keys, definition) {
  const aliases = new Set(definition.aliases)
  return keys.some((key) => aliases.has(key))
}

function explicitFeatureValue(key, listing, publication, portalFeatures, propertyProfile) {
  const candidates = {
    flatlet: [publication.flatlet, listing.flatlet, listing.propertyDetails?.flatlet, portalFeatures.flatlet],
    staffQuarters: [publication.staffQuarters, publication.staff_quarters, listing.staffQuarters, listing.staff_quarters, propertyProfile.staffRooms, propertyProfile.staff_rooms],
    garden: [publication.garden, listing.garden, listing.propertyDetails?.garden, portalFeatures.garden],
    pool: [publication.pool, listing.pool, listing.propertyDetails?.pool, portalFeatures.pool],
    fibre: [publication.fibre, publication.fibreInternet, publication.fibre_internet, listing.fibre, listing.fibreReady, listing.fibreInternet, portalFeatures.fibreInternet],
    petFriendly: [publication.petsAllowed, publication.pets_allowed, listing.petsAllowed, listing.pets_allowed, portalFeatures.petsAllowed],
  }
  for (const value of candidates[key] || []) {
    const normalized = key === 'staffQuarters' && Number(value) > 0 ? true : boolean(value)
    if (normalized !== null) return normalized
  }
  return null
}

export function normalizeListingPortalFeatures({ listing = {}, publication = {} } = {}) {
  const canonicalFacts = listing.seller_canonical_facts_json || listing.sellerCanonicalFacts || {}
  const propertyProfile = canonicalFacts.propertyProfile || canonicalFacts.property_profile || {}
  const portalFeatures = publication.portalFeatures || publication.portal_features || propertyProfile.portalFeatures || propertyProfile.portal_features || {}
  const labels = collectFeatureLabels(
    publication.features,
    publication.selectedFeatures,
    publication.selected_features,
    publication.amenities,
    listing.features,
    listing.selectedFeatures,
    listing.selected_features,
    listing.keySellingPoints,
    listing.key_selling_points,
    listing.propertyDetails?.features,
    listing.propertyDetails?.selectedFeatures,
    propertyProfile.selectedFeatures,
    propertyProfile.amenities,
  )
  const featureFacts = normalizeListingFeatureFacts(
    publication.featureFacts || publication.feature_facts || listing.featureFacts || listing.feature_facts || listing.sellerOnboarding?.formData?.featureFacts || {},
    labels,
  )
  const selectedKeys = labels.map(normalizeListingFeatureKey)
  const flags = {}
  for (const [key, definition] of Object.entries(FEATURE_DEFINITIONS)) {
    const explicit = explicitFeatureValue(key, listing, publication, portalFeatures, propertyProfile)
    const catalogKey = { staffQuarters: 'staff_quarters', petFriendly: 'pet_friendly' }[key] || key
    flags[key] = Object.hasOwn(featureFacts, catalogKey)
      ? featureFacts[catalogKey]
      : explicit === null
      ? (selectedFeature(selectedKeys, definition) ? true : null)
      : explicit
  }
  const knownAliases = new Set(Object.values(FEATURE_DEFINITIONS).flatMap((definition) => definition.aliases))
  const flagLabels = DESCRIPTIVE_PORTAL_FLAGS
    .filter(([key]) => boolean(portalFeatures[key]) === true || boolean(propertyProfile[key]) === true || boolean(listing[key]) === true || boolean(publication[key]) === true)
    .map(([, label]) => label)
  const typedLabels = LISTING_FEATURE_CATALOG
    .filter((feature) => feature.type === 'boolean' && featureFacts[feature.key] === true && !labels.some((label) => resolveListingFeature(label)?.key === feature.key))
    .map((feature) => feature.label)
  const typedDetailLabels = LISTING_FEATURE_CATALOG.flatMap((feature) => {
    const value = featureFacts[feature.key]
    if (feature.type === 'count' && Number.isFinite(value) && value > 0) return [`${feature.label}: ${value}`]
    if (feature.type === 'choice' && value) return [`${feature.label}: ${value}`]
    return []
  })
  const additionalLabels = [...labels, ...flagLabels, ...typedLabels].filter((label) => {
    const key = normalizeListingFeatureKey(label)
    const feature = resolveListingFeature(label)
    if (feature && featureFacts[feature.key] !== undefined && featureFacts[feature.key] !== true) return false
    return !knownAliases.has(key) && !NON_DESCRIPTIVE_FEATURE_KEYS.has(key)
  }).map((label) => DESCRIPTION_FEATURE_LABELS[normalizeListingFeatureKey(label)] || label).concat(typedDetailLabels)

  return {
    bedrooms: number(publication.bedrooms, listing.bedrooms, listing.propertyDetails?.bedrooms, propertyProfile.bedrooms),
    bathrooms: number(publication.bathrooms, listing.bathrooms, listing.propertyDetails?.bathrooms, propertyProfile.bathrooms),
    garages: number(publication.garages, listing.garages, listing.propertyDetails?.garages, propertyProfile.garages),
    parkingBays: number(publication.parking_bays, publication.parkingBays, listing.parking_bays, listing.parkingBays, listing.propertyDetails?.parkingBays, propertyProfile.parkingBays),
    ...flags,
    featureFacts,
    selectedLabels: labels,
    additionalLabels: [...new Map(additionalLabels.map((label) => [normalizeListingFeatureKey(label), label])).values()],
  }
}

export function appendPortalDescriptionFeatures(description = '', labels = []) {
  const base = text(description)
  const existing = base.toLowerCase()
  const missing = [...new Set((Array.isArray(labels) ? labels : []).map(text).filter(Boolean))]
    .filter((label) => !existing.includes(label.toLowerCase()))
  if (!missing.length) return base
  const prefix = base ? `${base}${/[.!?]$/.test(base) ? '' : '.'} ` : ''
  return `${prefix}Additional features include ${missing.join(', ').replace(/, ([^,]*)$/, ' and $1')}.`
}

export function resolveListingAddressVisibility(...values) {
  for (const value of values) {
    const key = normalizeListingFeatureKey(value)
    if (['show_exact_address', 'show_address', 'visible', 'public'].includes(key)) return 'show_exact_address'
    if (['complex_only', 'show_complex_only'].includes(key)) return 'complex_only'
    if (['hide_street_address', 'hide_street', 'hide_street_number', 'contact_agent_for_address', 'contact_agent'].includes(key)) return 'hide_street_address'
    if (value === true) return 'show_exact_address'
    if (value === false) return 'hide_street_address'
  }
  return 'hide_street_address'
}
