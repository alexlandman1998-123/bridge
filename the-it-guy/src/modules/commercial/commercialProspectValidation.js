import { COMMERCIAL_CATEGORY_OPTIONS, COMMERCIAL_ROLE_OPTIONS } from './commercialProspectTypes'
import { normalizeKey, normalizeText } from './commercialProspectFormatters'

function hasValue(value) {
  return Boolean(normalizeText(value))
}

export function validateCommercialProspectDraft(draft = {}) {
  const errors = {}
  const role = normalizeKey(draft.prospectRole || draft.prospectType)
  const companyName = normalizeText(draft.companyName || draft.ownerCompanyName || draft.landlordCompanyName || draft.buyerCompanyName || draft.tenantCompanyName)
  const propertyCategory = normalizeKey(draft.propertyCategory || draft.propertyType)
  const assignedBrokerId = normalizeText(draft.assignedBrokerId)
  const phone = normalizeText(draft.phone || draft.contactNumber || draft.contact_number)

  if (!COMMERCIAL_ROLE_OPTIONS.some((option) => option.value === role)) {
    errors.prospectRole = 'Choose seller, buyer, landlord, or tenant.'
  }

  if (!companyName) {
    errors.companyName = 'Add a company or owner name.'
  }

  if (!COMMERCIAL_CATEGORY_OPTIONS.some((option) => option.value === propertyCategory)) {
    errors.propertyCategory = 'Choose a property category.'
  }

  if (!assignedBrokerId) {
    errors.assignedBrokerId = 'Assign a broker before saving.'
  }

  if (role === 'seller') {
    if (!hasValue(draft.propertyAddress || draft.area)) errors.propertyAddress = 'Add a property or area.'
  }

  if (role === 'buyer') {
    if (!hasValue(draft.lookingFor)) errors.lookingFor = 'Tell us what the buyer is looking for.'
    if (!hasValue(draft.preferredArea)) errors.preferredArea = 'Add a preferred area.'
  }

  if (role === 'landlord') {
    if (!phone) errors.phone = 'Add a contact number.'
    if (!hasValue(draft.propertyAddress || draft.area || draft.preferredArea)) errors.propertyAddress = 'Add a property address.'
  }

  if (role === 'tenant') {
    if (!phone) errors.phone = 'Add a contact number.'
  }

  return errors
}
