import { buildSellerPostOnboardingDocumentState } from './sellerPostOnboardingDocumentState.js'

export const SELLER_ONBOARDING_GENERATED_DOCUMENTS_CONTRACT = 'arch9-seller-onboarding-generated-documents-v1'

export const SELLER_ONBOARDING_GENERATED_DOCUMENTS = Object.freeze([
  Object.freeze({ key: 'signed_disclosure_form', name: 'Mandatory Disclosure / Defects Form', category: 'property_condition_disclosure' }),
])

export function createSellerOnboardingGeneratedDocuments({ generatedAt = new Date().toISOString(), formData = {}, onboardingSubmitted = true } = {}) {
  const state = buildSellerPostOnboardingDocumentState({ formData, onboardingSubmitted })
  const documentStateByKey = new Map(state.documents.map((document) => [document.key, document]))
  return {
    contract: SELLER_ONBOARDING_GENERATED_DOCUMENTS_CONTRACT,
    generatedAt,
    postOnboardingDocumentState: state,
    documents: SELLER_ONBOARDING_GENERATED_DOCUMENTS.map((document) => ({
      ...document,
      generatedAt,
      status: documentStateByKey.get(document.key)?.status || 'not_started',
      completionRoute: documentStateByKey.get(document.key)?.completionRoute || '',
      source: 'seller_onboarding.generated_document',
    })),
    ficaDeclaration: {
      key: 'signed_fica_declaration',
      name: 'Seller FICA Declaration',
      status: documentStateByKey.get('signed_fica_declaration')?.status || 'not_started',
      completionRoute: documentStateByKey.get('signed_fica_declaration')?.completionRoute || '',
      source: 'agent_review_signing_pack',
    },
    mandate: {
      key: 'signed_mandate',
      name: 'Signed Mandate',
      status: documentStateByKey.get('signed_mandate')?.status || 'not_started',
      completionRoute: documentStateByKey.get('signed_mandate')?.completionRoute || '',
      source: 'agent_review_signing_pack',
    },
  }
}
