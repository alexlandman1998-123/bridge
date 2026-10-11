export const SELLER_ONBOARDING_FORMAL_SIGNING_PACK_CONTRACT = 'arch9-seller-onboarding-formal-signing-pack-v1'

export const SELLER_ONBOARDING_FORMAL_SIGNING_DOCUMENTS = Object.freeze(['disclosure', 'fica', 'mandate'])

export function normalizeSellerOnboardingFormalSigningSelection(selection = {}) {
  return {
    disclosure: selection.disclosure === true,
    fica: selection.fica === true,
    mandate: selection.mandate === true,
  }
}

export function validateSellerOnboardingFormalSigningSelection(selection = {}, { mandateSource = '' } = {}) {
  const normalized = normalizeSellerOnboardingFormalSigningSelection(selection)
  // The agency's own mandate is uploaded and reviewed separately; it is never
  // approved as an Arch9-generated copy by this FICA preparation step.
  const agencyUpload = mandateSource === 'agency_upload'
  const selectedDocuments = SELLER_ONBOARDING_FORMAL_SIGNING_DOCUMENTS.filter((key) => normalized[key])
  const missing = selectedDocuments.length ? [] : ['Choose at least one document']
  if (agencyUpload && normalized.mandate) missing.push('Upload the agency mandate separately in Documents')
  return {
    contract: SELLER_ONBOARDING_FORMAL_SIGNING_PACK_CONTRACT,
    valid: missing.length === 0,
    selectedDocuments,
    missing,
  }
}
