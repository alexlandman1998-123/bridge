import { assertRentalStatusTransition, RENTAL_STATUS } from './rentalDomainContract.js'

export const RENTAL_UNIT_CONTRACT_VERSION = 'arch9_rental_unit_v1'
export const RENTAL_UNIT_DEFAULT_LABEL = 'MAIN'

function text(value) { return String(value ?? '').trim() }
function number(value, fallback = null) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback }
function amount(value) { const parsed = number(value); return parsed !== null && parsed >= 0 ? parsed : null }

export function normalizeRentalUnitLabel(value = '') { return text(value).toUpperCase().replace(/\s+/g, ' ') || RENTAL_UNIT_DEFAULT_LABEL }

export function validateRentalUnit(values = {}) {
  const errors = {}
  if (!text(values.organisationId || values.organisation_id)) errors.organisationId = 'Organisation is required.'
  if (!text(values.propertyId || values.property_id)) errors.propertyId = 'Property is required.'
  if (number(values.bedrooms, 0) < 0) errors.bedrooms = 'Bedrooms cannot be negative.'
  if (number(values.bathrooms, 0) < 0) errors.bathrooms = 'Bathrooms cannot be negative.'
  if (amount(values.targetRent || values.target_rent) === null) errors.targetRent = 'Target rent must be a positive amount or zero.'
  if (amount(values.depositAmount || values.deposit_amount) === null) errors.depositAmount = 'Deposit must be a positive amount or zero.'
  if (!RENTAL_STATUS.unit.includes(text(values.status || 'vacant'))) errors.status = 'Unsupported unit status.'
  return { valid: Object.keys(errors).length === 0, errors }
}

export function createRentalUnitPayload(values = {}) {
  const validation = validateRentalUnit(values)
  if (!validation.valid) throw new Error(Object.values(validation.errors)[0])
  return {
    organisation_id: text(values.organisationId || values.organisation_id), property_id: text(values.propertyId || values.property_id),
    branch_id: text(values.branchId || values.branch_id) || null, unit_label: normalizeRentalUnitLabel(values.unitLabel || values.unit_label),
    bedrooms: number(values.bedrooms, 0), bathrooms: number(values.bathrooms, 0), parking_count: number(values.parkingCount || values.parking_count, 0),
    floor_area_sqm: number(values.floorAreaSqm || values.floor_area_sqm), target_rent: amount(values.targetRent || values.target_rent),
    deposit_amount: amount(values.depositAmount || values.deposit_amount), available_from: text(values.availableFrom || values.available_from) || null,
    status: text(values.status || 'vacant'), metadata_json: values.metadata && typeof values.metadata === 'object' && !Array.isArray(values.metadata) ? values.metadata : {},
    created_by: text(values.createdBy || values.created_by) || null,
  }
}

export function assertRentalUnitStatusTransition(unit = {}, nextStatus = '') {
  const from = text(unit.status || 'vacant')
  const to = text(nextStatus)
  assertRentalStatusTransition('unit', from, to)
  if (to === 'occupied' && !text(unit.activeTenancyId || unit.active_tenancy_id)) throw new Error('A unit cannot become occupied without an active tenancy claim.')
  if (from === 'occupied' && to !== 'occupied' && text(unit.activeTenancyId || unit.active_tenancy_id)) throw new Error('Release the active tenancy claim before changing an occupied unit status.')
  return true
}

/** Phase 29 performs this with a conditional database update in its tenancy transaction. */
export function claimRentalUnitActiveTenancy(unit = {}, tenancyId = '') {
  const claim = text(tenancyId)
  if (!claim) throw new Error('Tenancy id is required to claim unit occupancy.')
  const existing = text(unit.activeTenancyId || unit.active_tenancy_id)
  if (existing && existing !== claim) throw new Error('This unit already has an active tenancy.')
  return { ...unit, activeTenancyId: claim, status: 'occupied' }
}

export function releaseRentalUnitActiveTenancy(unit = {}, tenancyId = '') {
  const claim = text(tenancyId)
  const existing = text(unit.activeTenancyId || unit.active_tenancy_id)
  if (!existing || existing !== claim) throw new Error('Only the active tenancy may release unit occupancy.')
  return { ...unit, activeTenancyId: null, status: 'vacant' }
}

export function mapRentalUnit(row = {}) {
  return {
    id: text(row.id), organisationId: text(row.organisation_id), propertyId: text(row.property_id), branchId: text(row.branch_id), unitLabel: text(row.unit_label),
    bedrooms: number(row.bedrooms, 0), bathrooms: number(row.bathrooms, 0), parkingCount: number(row.parking_count, 0), floorAreaSqm: number(row.floor_area_sqm),
    targetRent: amount(row.target_rent), depositAmount: amount(row.deposit_amount), availableFrom: row.available_from || null, status: text(row.status), activeTenancyId: text(row.active_tenancy_id) || null,
    createdAt: row.created_at || null, updatedAt: row.updated_at || null, metadata: row.metadata_json && typeof row.metadata_json === 'object' ? row.metadata_json : {}, raw: row,
  }
}
