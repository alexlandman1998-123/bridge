export const RENTAL_PROPERTY_CONTRACT_VERSION = 'arch9_rental_property_v1'

export const RENTAL_PROPERTY_TYPES = Object.freeze([
  'house', 'apartment', 'townhouse', 'duplex', 'studio', 'estate', 'commercial', 'other',
])
export const RENTAL_PROPERTY_STATUSES = Object.freeze(['draft', 'active', 'archived'])

function text(value) { return String(value ?? '').trim() }
function lower(value) { return text(value).toLowerCase() }

export function normalizeRentalPropertyAddress(values = {}) {
  const address = {
    line1: text(values.line1 || values.addressLine1), line2: text(values.line2 || values.addressLine2),
    suburb: text(values.suburb), city: text(values.city), province: text(values.province), postalCode: text(values.postalCode),
  }
  return { ...address, normalized: [address.line1, address.line2, address.suburb, address.city, address.province, address.postalCode].map(lower).filter(Boolean).join('|') }
}

export function validateRentalProperty(values = {}) {
  const address = normalizeRentalPropertyAddress(values)
  const errors = {}
  if (!text(values.organisationId || values.organisation_id)) errors.organisationId = 'Organisation is required.'
  if (!text(values.name)) errors.name = 'Property name is required.'
  if (!RENTAL_PROPERTY_TYPES.includes(lower(values.propertyType || values.property_type))) errors.propertyType = 'Choose a supported property type.'
  if (!address.line1) errors.addressLine1 = 'Address line 1 is required.'
  if (!address.city) errors.city = 'City is required.'
  if (!RENTAL_PROPERTY_STATUSES.includes(lower(values.status || 'draft'))) errors.status = 'Choose a supported property status.'
  return { valid: Object.keys(errors).length === 0, errors, address }
}

export function createRentalPropertyPayload(values = {}) {
  const validation = validateRentalProperty(values)
  if (!validation.valid) throw new Error(Object.values(validation.errors)[0])
  return {
    organisation_id: text(values.organisationId || values.organisation_id),
    branch_id: text(values.branchId || values.branch_id) || null,
    assigned_manager_id: text(values.assignedManagerId || values.assigned_manager_id) || null,
    name: text(values.name), property_type: lower(values.propertyType || values.property_type), status: lower(values.status || 'draft'),
    address_line_1: validation.address.line1, address_line_2: validation.address.line2 || null,
    suburb: validation.address.suburb || null, city: validation.address.city, province: validation.address.province || null,
    postal_code: validation.address.postalCode || null, address_normalized: validation.address.normalized,
    metadata_json: values.metadata && typeof values.metadata === 'object' && !Array.isArray(values.metadata) ? values.metadata : {},
    created_by: text(values.createdBy || values.created_by) || null,
  }
}

export function mapRentalProperty(row = {}) {
  return {
    id: text(row.id), organisationId: text(row.organisation_id), branchId: text(row.branch_id), assignedManagerId: text(row.assigned_manager_id),
    name: text(row.name), propertyType: text(row.property_type), status: text(row.status),
    address: normalizeRentalPropertyAddress(row), createdAt: row.created_at || null, updatedAt: row.updated_at || null,
    metadata: row.metadata_json && typeof row.metadata_json === 'object' ? row.metadata_json : {}, raw: row,
  }
}

export function buildRentalPropertyListQuery({ organisationId = '', branchId = '', status = '', search = '', limit = 50 } = {}) {
  const normalizedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100)
  return { organisationId: text(organisationId), branchId: text(branchId), status: lower(status), search: text(search).slice(0, 120), limit: normalizedLimit }
}
