import { RENTAL_OCCUPANCY_BLOCK_STATUSES, RENTAL_OPERATING_MODES } from './shortTermRentalFoundation.js'

const text = (value) => String(value ?? '').trim()
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}

export const SHORT_TERM_UNIT_MODE_STATUS = Object.freeze({ active: 'active', paused: 'paused', retired: 'retired' })

export function createShortTermUnitModePayload(values = {}) {
  const unitId = text(values.unitId || values.unit_id)
  const organisationId = text(values.organisationId || values.organisation_id)
  const propertyId = text(values.propertyId || values.property_id)
  if (!unitId || !organisationId || !propertyId) throw new Error('Unit, property, and organisation are required.')
  return {
    unit_id: unitId,
    organisation_id: organisationId,
    property_id: propertyId,
    branch_id: text(values.branchId || values.branch_id) || null,
    operating_mode: RENTAL_OPERATING_MODES.shortTerm,
    status: SHORT_TERM_UNIT_MODE_STATUS.active,
    effective_from: text(values.effectiveFrom || values.effective_from) || new Date().toISOString().slice(0, 10),
    configuration: object(values.configuration),
    created_by: text(values.createdBy || values.created_by) || null,
  }
}

export function mapShortTermUnitInventory(row = {}) {
  const modes = Array.isArray(row.rental_unit_operating_modes) ? row.rental_unit_operating_modes : []
  const blocks = Array.isArray(row.rental_unit_occupancy_blocks) ? row.rental_unit_occupancy_blocks : []
  const propertyMetadata = object(row.rental_properties?.metadata_json)
  const shortTermMode = modes.find((mode) => mode.operating_mode === RENTAL_OPERATING_MODES.shortTerm && mode.status !== SHORT_TERM_UNIT_MODE_STATUS.retired) || null
  const activeBlockCount = blocks.filter((block) => RENTAL_OCCUPANCY_BLOCK_STATUSES.slice(0, 3).includes(block.status)).length
  return {
    id: text(row.id), unitLabel: text(row.unit_label) || 'Unit', propertyId: text(row.property_id), propertyName: text(row.rental_properties?.name) || 'Property',
    propertyCoverImageUrl: text(propertyMetadata.coverImageUrl || propertyMetadata.cover_image_url), propertyCoverImageAlt: text(propertyMetadata.coverImageAlt || propertyMetadata.cover_image_alt),
    organisationId: text(row.organisation_id), branchId: text(row.branch_id), status: text(row.status), bedrooms: Number(row.bedrooms || 0), bathrooms: Number(row.bathrooms || 0),
    shortTermMode, isShortTermEnabled: shortTermMode?.status === SHORT_TERM_UNIT_MODE_STATUS.active, activeBlockCount,
  }
}
