function normalize(value) {
  return String(value ?? '').trim().toLowerCase()
}

const OWNERSHIP_SETUP_TERMS = [
  'ownership route',
  'legal owner',
  'company registration',
  'trust registration',
  'estate reference',
  'principal id',
  'authorised signer',
  'authorised representative',
  'at least two owners',
]

export function needsSellerOwnershipSetup({ sellerSubject = null, missingFields = [] } = {}) {
  if (sellerSubject && sellerSubject.onboardingReady === false) return true
  return (Array.isArray(missingFields) ? missingFields : []).some((field) => {
    const value = normalize(field)
    return OWNERSHIP_SETUP_TERMS.some((term) => value.includes(term))
  })
}

/** Select the agent editor that can resolve a FICA/document blocker. */
export function resolveSellerInformationEditMode({ sellerSubject = null, missingFields = [] } = {}) {
  if (needsSellerOwnershipSetup({ sellerSubject, missingFields })) return 'profile'
  if ((Array.isArray(missingFields) ? missingFields : []).some((field) => normalize(field).includes('address'))) return 'address'
  return 'personal'
}

export default { needsSellerOwnershipSetup, resolveSellerInformationEditMode }
