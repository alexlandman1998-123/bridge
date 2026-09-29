export const SPECIALIST_SALES_LISTING_SCHEMA_VERSION = 'arch9_specialist_sales_listing_schema_v2'

const text = (value = '') => String(value || '').trim()

const FIELD_DEFINITIONS = Object.freeze({
  grossLettableArea: { label: 'Gross lettable area', kind: 'measurement', unit: 'm²' },
  zoning: { label: 'Zoning', kind: 'text' },
  parking: { label: 'Parking', kind: 'text' },
  listingTerms: { label: 'Lease or sale terms', kind: 'terms' },
  warehouseOrFactoryArea: { label: 'Warehouse / factory area', kind: 'measurement', unit: 'm²' },
  yardSize: { label: 'Yard size', kind: 'measurement', unit: 'm²' },
  powerSupply: { label: 'Power supply', kind: 'text' },
  loadingAccess: { label: 'Loading access', kind: 'boolean' },
  farmSize: { label: 'Farm size', kind: 'measurement', unit: 'ha' },
  waterSupplyOrRights: { label: 'Water supply / rights', kind: 'text' },
  agriculturalUse: { label: 'Agricultural use', kind: 'text' },
  erfSize: { label: 'Erf / land size', kind: 'measurement', unit: 'm²' },
})

const CATEGORY_ALIASES = Object.freeze({
  commercial: 'commercial',
  retail: 'commercial',
  mixed_use: 'commercial',
  industrial: 'industrial',
  agricultural: 'agricultural',
  farm: 'agricultural',
  smallholding: 'agricultural',
  vacant_land: 'land',
  land: 'land',
})

const REQUIRED_FIELDS = Object.freeze({
  commercial: ['grossLettableArea', 'zoning', 'parking', 'listingTerms'],
  industrial: ['warehouseOrFactoryArea', 'yardSize', 'powerSupply', 'loadingAccess'],
  agricultural: ['farmSize', 'waterSupplyOrRights', 'agriculturalUse'],
  land: ['erfSize', 'zoning'],
})

export function resolveSpecialistSalesCategory(value = '') {
  const key = text(value).toLowerCase().replace(/[\s-]+/g, '_')
  return CATEGORY_ALIASES[key] || ''
}

export function getSpecialistSalesListingSchema(propertyCategory = '', listingType = 'sale') {
  const category = resolveSpecialistSalesCategory(propertyCategory)
  const allFields = REQUIRED_FIELDS[category] || []
  const sale = ['sale', 'private_sale'].includes(text(listingType).toLowerCase())
  // A commercial sale can be described without lettable area. Keep the field
  // available when known; commercial leases still require it for readiness.
  const requiredFields = category === 'commercial' && sale
    ? allFields.filter((key) => key !== 'grossLettableArea')
    : allFields
  return {
    version: SPECIALIST_SALES_LISTING_SCHEMA_VERSION,
    category,
    requiredFields,
    fields: allFields.map((key) => ({ key, ...FIELD_DEFINITIONS[key], required: requiredFields.includes(key) })),
  }
}

export function getSpecialistSalesRequiredFields(propertyCategory = '', listingType = 'sale') {
  return getSpecialistSalesListingSchema(propertyCategory, listingType).requiredFields
}
