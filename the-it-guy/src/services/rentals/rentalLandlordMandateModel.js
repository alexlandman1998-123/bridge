export const RENTAL_LANDLORD_MANDATE_CONTRACT_VERSION = 'arch9_rental_landlord_mandate_v1'
export const RENTAL_LANDLORD_RELATIONSHIP_STATUSES = Object.freeze(['active', 'inactive', 'ended'])
export const RENTAL_MANDATE_STATUSES = Object.freeze(['draft', 'active', 'expired', 'terminated'])
export const RENTAL_MANDATE_AUTHORITY_STATUSES = Object.freeze(['pending', 'confirmed', 'withdrawn'])
export const RENTAL_MANDATE_FEE_TYPES = Object.freeze(['percentage', 'fixed'])

const text = (value) => String(value ?? '').trim()
const numeric = (value) => Number(value ?? 0)
const isoDate = (value) => text(value) || null

export function validateRentalPropertyLandlord(values = {}) {
  const errors = {}; const share = numeric(values.ownershipShare ?? values.ownership_share)
  if (!text(values.organisationId || values.organisation_id)) errors.organisationId = 'Organisation is required.'
  if (!text(values.propertyId || values.property_id)) errors.propertyId = 'Property is required.'
  if (!text(values.partyId || values.party_id)) errors.partyId = 'Canonical landlord record is required.'
  if (!Number.isFinite(share) || share <= 0 || share > 100) errors.ownershipShare = 'Ownership share must be greater than 0 and no more than 100.'
  if (!RENTAL_LANDLORD_RELATIONSHIP_STATUSES.includes(text(values.relationshipStatus || values.relationship_status || 'active').toLowerCase())) errors.relationshipStatus = 'Choose a supported relationship status.'
  if (isoDate(values.effectiveTo || values.effective_to) && isoDate(values.effectiveFrom || values.effective_from) && isoDate(values.effectiveTo || values.effective_to) < isoDate(values.effectiveFrom || values.effective_from)) errors.effectiveTo = 'End date cannot be before start date.'
  return { valid: Object.keys(errors).length === 0, errors }
}

export function createRentalPropertyLandlordPayload(values = {}) {
  const validation = validateRentalPropertyLandlord(values); if (!validation.valid) throw new Error(Object.values(validation.errors)[0])
  return { organisation_id: text(values.organisationId || values.organisation_id), property_id: text(values.propertyId || values.property_id), branch_id: text(values.branchId || values.branch_id) || null, party_id: text(values.partyId || values.party_id), ownership_share: numeric(values.ownershipShare ?? values.ownership_share), is_primary_contact: Boolean(values.primaryContact ?? values.is_primary_contact), relationship_status: text(values.relationshipStatus || values.relationship_status || 'active').toLowerCase(), effective_from: isoDate(values.effectiveFrom || values.effective_from), effective_to: isoDate(values.effectiveTo || values.effective_to), metadata_json: values.metadata && typeof values.metadata === 'object' && !Array.isArray(values.metadata) ? values.metadata : {}, created_by: text(values.createdBy || values.created_by) || null }
}

export function validateRentalPropertyMandate(values = {}) {
  const errors = {}; const fee = numeric(values.managementFeeAmount ?? values.management_fee_amount)
  if (!text(values.organisationId || values.organisation_id)) errors.organisationId = 'Organisation is required.'
  if (!text(values.propertyId || values.property_id)) errors.propertyId = 'Property is required.'
  if (!RENTAL_MANDATE_STATUSES.includes(text(values.mandateStatus || values.mandate_status || 'draft').toLowerCase())) errors.mandateStatus = 'Choose a supported mandate status.'
  if (!RENTAL_MANDATE_AUTHORITY_STATUSES.includes(text(values.authorityStatus || values.authority_status || 'pending').toLowerCase())) errors.authorityStatus = 'Choose a supported authority status.'
  if (!RENTAL_MANDATE_FEE_TYPES.includes(text(values.managementFeeType || values.management_fee_type || 'percentage').toLowerCase())) errors.managementFeeType = 'Choose a supported fee type.'
  if (!Number.isFinite(fee) || fee < 0) errors.managementFeeAmount = 'Management fee cannot be negative.'
  if (text(values.managementFeeType || values.management_fee_type || 'percentage').toLowerCase() === 'percentage' && fee > 100) errors.managementFeeAmount = 'Percentage fee cannot exceed 100.'
  if (isoDate(values.endsOn || values.ends_on) && isoDate(values.startsOn || values.starts_on) && isoDate(values.endsOn || values.ends_on) < isoDate(values.startsOn || values.starts_on)) errors.endsOn = 'End date cannot be before start date.'
  return { valid: Object.keys(errors).length === 0, errors }
}

export function createRentalPropertyMandatePayload(values = {}) {
  const validation = validateRentalPropertyMandate(values); if (!validation.valid) throw new Error(Object.values(validation.errors)[0])
  return { organisation_id: text(values.organisationId || values.organisation_id), property_id: text(values.propertyId || values.property_id), branch_id: text(values.branchId || values.branch_id) || null, mandate_status: text(values.mandateStatus || values.mandate_status || 'draft').toLowerCase(), authority_status: text(values.authorityStatus || values.authority_status || 'pending').toLowerCase(), starts_on: isoDate(values.startsOn || values.starts_on), ends_on: isoDate(values.endsOn || values.ends_on), management_fee_type: text(values.managementFeeType || values.management_fee_type || 'percentage').toLowerCase(), management_fee_amount: numeric(values.managementFeeAmount ?? values.management_fee_amount), metadata_json: values.metadata && typeof values.metadata === 'object' && !Array.isArray(values.metadata) ? values.metadata : {}, created_by: text(values.createdBy || values.created_by) || null }
}

export function mapRentalPropertyLandlord(row = {}) { return { id: text(row.id), organisationId: text(row.organisation_id), propertyId: text(row.property_id), partyId: text(row.party_id), ownershipShare: numeric(row.ownership_share), primaryContact: Boolean(row.is_primary_contact), relationshipStatus: text(row.relationship_status), effectiveFrom: row.effective_from || null, effectiveTo: row.effective_to || null, raw: row } }
export function mapRentalPropertyMandate(row = {}) { return { id: text(row.id), organisationId: text(row.organisation_id), propertyId: text(row.property_id), mandateStatus: text(row.mandate_status), authorityStatus: text(row.authority_status), startsOn: row.starts_on || null, endsOn: row.ends_on || null, managementFeeType: text(row.management_fee_type), managementFeeAmount: numeric(row.management_fee_amount), raw: row } }
export function mapRentalPropertyMarketingReadiness(row = {}) { return { propertyId: text(row.property_id), activeLandlordCount: numeric(row.active_landlord_count), hasPrimaryContact: Boolean(row.has_primary_contact), ownershipShare: numeric(row.active_ownership_share), hasActiveMandate: Boolean(row.has_active_mandate), marketingReady: Boolean(row.marketing_ready), raw: row } }
