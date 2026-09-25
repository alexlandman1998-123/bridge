// Canonical listing facts. Portal-specific field names and category restrictions
// belong in the mappers, not in the agent's capture UI. Omitted facts mean Unknown.
const BOTH_LISTING_TYPES = Object.freeze(['sale', 'rental'])
const boolean = (key, label, group, aliases = [], listingTypes = BOTH_LISTING_TYPES) => ({ key, label, group, type: 'boolean', aliases, listingTypes })
const count = (key, label, group) => ({ key, label, group, type: 'count', listingTypes: BOTH_LISTING_TYPES })
const choice = (key, label, group, options) => ({ key, label, group, type: 'choice', options, listingTypes: BOTH_LISTING_TYPES })

export const LISTING_FEATURE_GROUPS = Object.freeze([
  'Rooms & living', 'Parking & buildings', 'Outdoor & leisure', 'Security',
  'Energy & water', 'Connectivity & utilities', 'Accessibility & views', 'Other',
])

export const LISTING_FEATURE_CATALOG = Object.freeze([
  boolean('study', 'Study', 'Rooms & living'),
  count('studies', 'Number of studies', 'Rooms & living'),
  boolean('staff_quarters', 'Staff quarters', 'Rooms & living', ['staff_accommodation']),
  boolean('built_in_cupboards', 'Built-in cupboards', 'Rooms & living'),
  boolean('walk_in_closet', 'Walk-in closet', 'Rooms & living'),
  boolean('family_tv_room', 'Family / TV room', 'Rooms & living'),
  boolean('kitchen', 'Kitchen', 'Rooms & living'),
  count('kitchens', 'Number of kitchens', 'Rooms & living'),
  boolean('kitchen_dishwasher', 'Kitchen dishwasher', 'Rooms & living'),
  boolean('kitchen_cleaning_service', 'Kitchen cleaning service', 'Rooms & living'),
  boolean('kitchen_sink', 'Kitchen sink', 'Rooms & living'),
  boolean('kitchen_coffee_machine', 'Kitchen coffee machine', 'Rooms & living'),
  boolean('scullery', 'Scullery', 'Rooms & living'),
  boolean('pantry', 'Pantry', 'Rooms & living'),
  boolean('guest_toilet', 'Guest toilet', 'Rooms & living'),
  boolean('entrance_hall', 'Entrance hall', 'Rooms & living'),
  boolean('laundry', 'Laundry', 'Rooms & living'),
  boolean('fireplace', 'Fireplace', 'Rooms & living'),
  boolean('air_conditioning', 'Air conditioning', 'Rooms & living', ['aircon']),
  boolean('open_plan_living', 'Open-plan living', 'Rooms & living'),
  count('en_suite', 'En-suite bathrooms', 'Rooms & living'),
  count('lounges', 'Lounges', 'Rooms & living'),
  count('dining_areas', 'Dining areas', 'Rooms & living'),
  count('reception_rooms', 'Reception rooms', 'Rooms & living'),
  count('domestic_rooms', 'Domestic rooms', 'Rooms & living'),
  count('domestic_bathrooms', 'Domestic bathrooms', 'Rooms & living'),
  count('outside_toilets', 'Outside toilets', 'Rooms & living'),
  boolean('flatlet', 'Flatlet', 'Parking & buildings'),
  boolean('garden_cottage', 'Garden cottage', 'Parking & buildings'),
  boolean('storage', 'Storage', 'Parking & buildings'),
  boolean('new_development', 'New development', 'Parking & buildings', [], ['sale']),
  boolean('second_house', 'Second house', 'Parking & buildings'),
  boolean('standalone_building', 'Standalone building', 'Parking & buildings'),
  count('outbuildings_area', 'Outbuildings area (m²)', 'Parking & buildings'),
  count('carports', 'Carports', 'Parking & buildings'),
  count('storeys', 'Storeys', 'Parking & buildings'),
  boolean('secure_parking', 'Secure parking', 'Parking & buildings'),
  boolean('street_parking', 'On-street parking', 'Parking & buildings'),
  boolean('covered_parking', 'Shade-net covered parking', 'Parking & buildings'),
  boolean('underground_parking', 'Underground parking', 'Parking & buildings'),
  boolean('visitors_parking', 'Visitors parking', 'Parking & buildings'),
  boolean('tandem_parking', 'Tandem parking', 'Parking & buildings'),
  boolean('single_parking', 'Single parking', 'Parking & buildings'),
  boolean('double_parking', 'Double parking', 'Parking & buildings'),
  boolean('triple_parking', 'Triple parking', 'Parking & buildings'),
  choice('roof_type', 'Roof type', 'Parking & buildings', ['Tiles', 'Slate', 'Thatch', 'Other']),
  choice('finishes', 'Finishes', 'Parking & buildings', ['Very High', 'High', 'Medium', 'Budget']),
  boolean('pool', 'Pool', 'Outdoor & leisure'),
  boolean('garden', 'Garden', 'Outdoor & leisure'),
  boolean('balcony', 'Balcony', 'Outdoor & leisure'),
  boolean('courtyard', 'Courtyard', 'Outdoor & leisure'),
  boolean('roof_area', 'Roof area', 'Outdoor & leisure'),
  count('outside_areas', 'Number of outside areas', 'Outdoor & leisure'),
  boolean('deck', 'Deck', 'Outdoor & leisure'),
  boolean('patio', 'Patio', 'Outdoor & leisure'),
  boolean('lapa', 'Lapa', 'Outdoor & leisure'),
  boolean('built_in_braai', 'Built-in braai', 'Outdoor & leisure'),
  boolean('entertainment_area', 'Entertainment area', 'Outdoor & leisure'),
  boolean('clubhouse', 'Clubhouse', 'Outdoor & leisure'),
  boolean('gym', 'Gym', 'Outdoor & leisure'),
  boolean('golf', 'Golf', 'Outdoor & leisure'),
  boolean('tennis_court', 'Tennis court', 'Outdoor & leisure'),
  boolean('squash_court', 'Squash court', 'Outdoor & leisure'),
  boolean('jacuzzi', 'Jacuzzi', 'Outdoor & leisure'),
  boolean('jetty_berth', 'Jetty berth', 'Outdoor & leisure'),
  boolean('irrigation_system', 'Irrigation system', 'Outdoor & leisure'),
  boolean('paving', 'Paving', 'Outdoor & leisure'),
  boolean('kids_play_area', 'Kids play area', 'Outdoor & leisure'),
  boolean('walking_trails', 'Walking trails', 'Outdoor & leisure'),
  boolean('security', 'Security (general)', 'Security'),
  boolean('security_estate', 'Security estate', 'Security'),
  boolean('electric_fence', 'Electric fence', 'Security', ['electric_fencing']),
  boolean('fence', 'Fence', 'Security'),
  boolean('access_gate', 'Access gate', 'Security'),
  boolean('security_post', 'Security post', 'Security'),
  boolean('alarm', 'Alarm', 'Security'),
  boolean('intercom', 'Intercom', 'Security'),
  boolean('solar', 'Solar', 'Energy & water'),
  boolean('solar_system', 'Solar system', 'Energy & water'),
  boolean('solar_panels', 'Solar panels', 'Energy & water'),
  boolean('solar_geyser', 'Solar geyser', 'Energy & water'),
  boolean('gas_geyser', 'Gas geyser', 'Energy & water'),
  boolean('backup_power', 'Backup power', 'Energy & water'),
  boolean('inverter_battery', 'Inverter / battery', 'Energy & water'),
  boolean('generator', 'Generator', 'Energy & water'),
  boolean('backup_water', 'Backup water', 'Energy & water'),
  boolean('water_tank', 'Water tank', 'Energy & water'),
  boolean('borehole', 'Borehole', 'Energy & water'),
  boolean('fibre', 'Fibre', 'Connectivity & utilities'),
  boolean('internet_adsl', 'ADSL internet', 'Connectivity & utilities'),
  boolean('internet_dial_up', 'Dial-up internet', 'Connectivity & utilities'),
  boolean('internet_fixed_wimax', 'Fixed WiMAX internet', 'Connectivity & utilities'),
  boolean('internet_isdn', 'ISDN internet', 'Connectivity & utilities'),
  boolean('internet_satellite', 'Satellite internet', 'Connectivity & utilities'),
  boolean('internet_vdsl', 'VDSL internet', 'Connectivity & utilities'),
  boolean('nearby_bus', 'Nearby bus service', 'Connectivity & utilities'),
  boolean('nearby_minibus_taxi', 'Nearby minibus taxi service', 'Connectivity & utilities'),
  boolean('nearby_train', 'Nearby train service', 'Connectivity & utilities'),
  boolean('water_included', 'Water included', 'Connectivity & utilities', [], ['rental']),
  boolean('electricity_included', 'Electricity included', 'Connectivity & utilities', [], ['rental']),
  boolean('satellite', 'Satellite', 'Connectivity & utilities'),
  boolean('tv', 'TV', 'Connectivity & utilities'),
  boolean('sea_view', 'Sea view', 'Accessibility & views'),
  boolean('mountain_view', 'Mountain view', 'Accessibility & views'),
  boolean('scenic_view', 'Scenic view', 'Accessibility & views'),
  boolean('wheelchair_accessible', 'Wheelchair accessible', 'Accessibility & views', ['handicap_available']),
  boolean('pet_friendly', 'Pet friendly', 'Other', ['pets_allowed']),
])

export const LISTING_FEATURE_BY_KEY = new Map(LISTING_FEATURE_CATALOG.map((feature) => [feature.key, feature]))

export function normalizeListingFeatureKey(value = '') {
  return String(value ?? '').trim().toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

const FEATURE_KEY_BY_ALIAS = new Map(LISTING_FEATURE_CATALOG.flatMap((feature) =>
  [feature.key, feature.label, ...(feature.aliases || [])].map((value) => [normalizeListingFeatureKey(value), feature.key]),
))

export function resolveListingFeature(value = '') {
  return LISTING_FEATURE_BY_KEY.get(FEATURE_KEY_BY_ALIAS.get(normalizeListingFeatureKey(value))) || null
}

function normalizeFactValue(feature, value) {
  if (feature.type === 'boolean') {
    if (value === true || value === false) return value
    if (value === 'yes') return true
    if (value === 'no') return false
    return null
  }
  if (feature.type === 'count') {
    if (value === '' || value === null || value === undefined) return null
    const number = Number(value)
    return Number.isFinite(number) && number >= 0 ? number : null
  }
  return feature.options.includes(value) ? value : null
}

export function normalizeListingFeatureFacts(stored = {}, legacySelections = []) {
  const source = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}
  const legacy = new Set((Array.isArray(legacySelections) ? legacySelections : []).map((value) => resolveListingFeature(value)?.key).filter(Boolean))
  const facts = {}
  for (const feature of LISTING_FEATURE_CATALOG) {
    if (Object.hasOwn(source, feature.key)) facts[feature.key] = normalizeFactValue(feature, source[feature.key])
    else if (feature.type === 'boolean' && legacy.has(feature.key)) facts[feature.key] = true
  }
  return facts
}

export function setListingFeatureFact(facts = {}, key = '', value = null) {
  const feature = LISTING_FEATURE_BY_KEY.get(key)
  if (!feature) return { ...facts }
  return { ...facts, [key]: normalizeFactValue(feature, value) }
}

// Seller-onboarding JSON merges ignore null patches; a non-empty marker is
// required to deliberately clear a previously saved Yes/No/count/choice.
export function serializeListingFeatureFacts(facts = {}) {
  const normalized = normalizeListingFeatureFacts(facts)
  return Object.fromEntries(Object.entries(normalized).map(([key, value]) => [key, value === null ? 'unknown' : value]))
}

export function mergeListingFeatureSelections(selections = [], facts = {}, { format = 'key' } = {}) {
  const unknownSelections = (Array.isArray(selections) ? selections : []).filter((value) => !resolveListingFeature(value))
  const selected = LISTING_FEATURE_CATALOG
    .filter((feature) => feature.type === 'boolean' && facts[feature.key] === true)
    .map((feature) => format === 'label' ? feature.label : feature.key)
  return [...new Set([...unknownSelections, ...selected])]
}
