export const PROPERTY24_PHASE2_CATALOGUE_VERSION = 'property24_v55_phase2_2026_09_21'

// This is the catalogue returned by the authenticated production v55
// property-types endpoint on 2026-09-21. It deliberately excludes
// developments: Vacant Land / Plot is the only land scope in this phase.
export const PROPERTY24_PHASE2_PROPERTY_TYPES = Object.freeze([
  { id: 4, description: 'House', category: 'residential', aliases: ['house', 'home', 'freehold', 'freehold_house'] },
  { id: 5, description: 'Apartment / Flat', category: 'residential', aliases: ['apartment', 'flat', 'unit', 'sectional_title', 'sectional_title_apartment'] },
  { id: 6, description: 'Townhouse', category: 'residential', aliases: ['townhouse', 'town_house', 'duplex', 'cluster'] },
  { id: 8, description: 'Vacant Land / Plot', category: 'land', aliases: ['vacant_land', 'vacant_stand', 'plot', 'land', 'stand'] },
  { id: 10, description: 'Farm', category: 'agricultural', aliases: ['farm', 'smallholding', 'small_holding', 'agricultural_holding', 'agricultural_land'] },
  { id: 11, description: 'Commercial Property', category: 'commercial', aliases: ['commercial', 'commercial_property', 'office', 'office_building', 'medical_suite', 'business_park', 'commercial_building', 'retail', 'retail_store', 'shop', 'showroom', 'shopping_centre', 'mixed_use', 'mixed_use_building', 'mixed_use_estate'] },
  { id: 12, description: 'Industrial Property', category: 'industrial', aliases: ['industrial', 'industrial_property', 'warehouse', 'factory', 'distribution_centre', 'industrial_park'] },
])

export const PROPERTY24_PHASE2_ALLOWED_CATEGORIES = Object.freeze(['residential', 'commercial', 'industrial', 'agricultural', 'land'])

function text(value = '') {
  return String(value || '').trim()
}

function key(value = '') {
  return text(value).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function id(value) {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null
}

export function resolveProperty24Phase2PropertyType(value) {
  const numericId = id(value)
  if (numericId) return PROPERTY24_PHASE2_PROPERTY_TYPES.find((item) => item.id === numericId) || null
  const valueKey = key(value)
  if (!valueKey) return null
  return PROPERTY24_PHASE2_PROPERTY_TYPES.find((item) => key(item.description) === valueKey || item.aliases.map(key).includes(valueKey)) || null
}

export function resolveProperty24Phase2PropertyTypeId(value) {
  return resolveProperty24Phase2PropertyType(value)?.id || null
}

export function isProperty24Phase2Category(value) {
  return PROPERTY24_PHASE2_ALLOWED_CATEGORIES.includes(text(value).toLowerCase())
}

export function verifyProperty24Phase2Catalogue(records = []) {
  const received = new Map((Array.isArray(records) ? records : []).map((item) => [id(item?.id), text(item?.description)]).filter(([typeId]) => typeId))
  const expected = new Map(PROPERTY24_PHASE2_PROPERTY_TYPES.map((item) => [item.id, item.description]))
  const missing = [...expected.entries()].filter(([typeId, description]) => received.get(typeId) !== description).map(([typeId, description]) => ({ id: typeId, description, received: received.get(typeId) || null }))
  const unexpected = [...received.entries()].filter(([typeId]) => !expected.has(typeId)).map(([typeId, description]) => ({ id: typeId, description }))
  return {
    version: PROPERTY24_PHASE2_CATALOGUE_VERSION,
    matches: missing.length === 0 && unexpected.length === 0,
    missing,
    unexpected,
    expected: PROPERTY24_PHASE2_PROPERTY_TYPES,
  }
}
