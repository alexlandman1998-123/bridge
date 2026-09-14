export const SELLER_ONBOARDING_GENERATED_DOCUMENTS_CONTRACT = 'arch9-seller-onboarding-generated-documents-v1'

export const SELLER_ONBOARDING_GENERATED_DOCUMENTS = Object.freeze([
  Object.freeze({ key: 'signed_fica_declaration', name: 'Seller FICA Declaration', category: 'fica_declaration' }),
  Object.freeze({ key: 'signed_disclosure_form', name: 'Mandatory Disclosure / Defects Form', category: 'property_condition_disclosure' }),
])

export function createSellerOnboardingGeneratedDocuments({ generatedAt = new Date().toISOString() } = {}) {
  return {
    contract: SELLER_ONBOARDING_GENERATED_DOCUMENTS_CONTRACT,
    generatedAt,
    documents: SELLER_ONBOARDING_GENERATED_DOCUMENTS.map((document) => ({
      ...document,
      generatedAt,
      status: 'completed',
      source: 'seller_onboarding.generated_document',
    })),
    mandate: {
      key: 'signed_mandate',
      name: 'Signed Mandate',
      status: 'required',
      source: 'separate_signed_upload',
    },
  }
}
