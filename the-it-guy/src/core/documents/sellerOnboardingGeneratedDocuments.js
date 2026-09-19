export const SELLER_ONBOARDING_GENERATED_DOCUMENTS_CONTRACT = 'arch9-seller-onboarding-generated-documents-v1'

export const SELLER_ONBOARDING_GENERATED_DOCUMENTS = Object.freeze([
  Object.freeze({ key: 'signed_disclosure_form', name: 'Mandatory Disclosure / Defects Form', category: 'property_condition_disclosure' }),
])

export function createSellerOnboardingGeneratedDocuments({ generatedAt = new Date().toISOString() } = {}) {
  return {
    contract: SELLER_ONBOARDING_GENERATED_DOCUMENTS_CONTRACT,
    generatedAt,
    documents: SELLER_ONBOARDING_GENERATED_DOCUMENTS.map((document) => ({
      ...document,
      generatedAt,
      // The disclosure facts are frozen at onboarding submission; completion
      // still depends on every required seller's declaration signature.
      status: 'awaiting_signatures',
      source: 'seller_onboarding.generated_document',
    })),
    ficaDeclaration: {
      key: 'signed_fica_declaration',
      name: 'Seller FICA Declaration',
      status: 'required_after_agent_review',
      source: 'agent_review_signing_pack',
    },
    mandate: {
      key: 'signed_mandate',
      name: 'Signed Mandate',
      status: 'required_after_agent_review',
      source: 'agent_review_signing_pack',
    },
  }
}
