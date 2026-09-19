export const SELLER_ONBOARDING_FORMAL_SIGNING_PACK_CONTRACT = 'arch9-seller-onboarding-formal-signing-pack-v1'

export const SELLER_ONBOARDING_FORMAL_SIGNING_DOCUMENTS = Object.freeze(['fica', 'mandate'])

export function normalizeSellerOnboardingFormalSigningSelection(selection = {}) {
  return {
    disclosure: false,
    fica: selection.fica === true,
    mandate: selection.mandate === true,
  }
}

export function validateSellerOnboardingFormalSigningSelection(selection = {}) {
  const normalized = normalizeSellerOnboardingFormalSigningSelection(selection)
  const missing = SELLER_ONBOARDING_FORMAL_SIGNING_DOCUMENTS.filter((key) => !normalized[key])
  return {
    contract: SELLER_ONBOARDING_FORMAL_SIGNING_PACK_CONTRACT,
    valid: missing.length === 0,
    selectedDocuments: SELLER_ONBOARDING_FORMAL_SIGNING_DOCUMENTS.filter((key) => normalized[key]),
    missing,
  }
}
