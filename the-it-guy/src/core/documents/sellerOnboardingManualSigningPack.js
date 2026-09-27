import { buildSellerFicaDueDiligenceMarkup, SELLER_FICA_DUE_DILIGENCE_TEMPLATE_VERSION } from './sellerFicaDueDiligenceMarkup.js'
import { buildSellerMandateDocumentMarkup, SELLER_MANDATE_DOCUMENT_TEMPLATE_VERSION } from './sellerMandateDocumentMarkup.js'
import { hasCompletedOnboardingDisclosureSignature } from './sellerDocumentSigningContract.js'

export const SELLER_ONBOARDING_MANUAL_SIGNING_PACK_CONTRACT = 'arch9-seller-onboarding-manual-signing-pack-v1'

const text = (value) => String(value ?? '').trim()
const record = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}

/** Creates the reviewed, unsigned copies shared by physical and portal signing. */
export function createSellerOnboardingManualSigningPack({ existing = {}, formalPackApproval = {}, signingPack = {}, postOnboardingDrafts = {}, formData = {}, actor = '', generatedAt = new Date().toISOString() } = {}) {
  const approval = record(formalPackApproval)
  if (approval.status !== 'approved') throw new Error('Approve the onboarding before preparing signing copies.')
  const drafts = Array.isArray(record(postOnboardingDrafts).documents) ? postOnboardingDrafts.documents : []
  const ficaDraft = drafts.find((draft) => text(draft?.targetRequirementKey || draft?.requirementKey || draft?.key) === 'signed_fica_declaration')
  if (!ficaDraft) throw new Error('The approved FICA declaration draft is unavailable.')
  const disclosureComplete = hasCompletedOnboardingDisclosureSignature(formData)
  const disclosureDraft = drafts.find((draft) => text(draft?.targetRequirementKey || draft?.requirementKey || draft?.key) === 'signed_disclosure_form')
  if (!disclosureComplete && approval.documentRoutes?.signed_disclosure_form && !text(disclosureDraft?.generatedHtml)) {
    throw new Error('The reviewed defects disclosure is unavailable. Rebuild the onboarding drafts before sending it for signature.')
  }
  const mandateType = text(record(signingPack.mandate).mandateType).toLowerCase()
  if (!['sole', 'exclusive', 'sole_mandate', 'open'].includes(mandateType)) throw new Error('Choose an exclusive or open mandate before preparing signing copies.')
  const mandateName = mandateType === 'open' ? 'Open Mandate to Sell' : 'Exclusive Mandate to Sell'
  const ficaModel = record(record(ficaDraft.metadata).ficaDeclarationModel)
  const entry = {
    generatedAt: text(generatedAt), generatedBy: text(actor), status: Object.values(approval.documentRoutes || {}).includes('digital_pack') || approval.signingRoute === 'digital_pack' ? 'awaiting_signature' : 'awaiting_signed_hard_copy',
    signingPackSnapshot: signingPack,
    documents: [
      ...(!disclosureComplete && text(disclosureDraft?.generatedHtml) ? [{
        key: 'signed_disclosure_form', name: 'Mandatory Disclosure / Defects Form',
        templateVersion: text(disclosureDraft.templateVersion || disclosureDraft.version),
        generatedHtml: disclosureDraft.generatedHtml,
        generatedFileName: 'seller-defects-disclosure-signing.pdf',
        sourceDraftFingerprint: text(disclosureDraft.fingerprint || disclosureDraft.sourceDraftFingerprint),
      }] : []),
      {
        key: 'signed_fica_declaration', name: 'Seller FICA Due Diligence Record',
        templateVersion: SELLER_FICA_DUE_DILIGENCE_TEMPLATE_VERSION,
        generatedHtml: buildSellerFicaDueDiligenceMarkup({ model: ficaModel, formData, signingPack, branding: signingPack.branding, generatedAt }),
        generatedFileName: 'seller-fica-due-diligence-physical-signing.pdf',
      },
      {
        key: 'signed_mandate', name: mandateName,
        templateVersion: SELLER_MANDATE_DOCUMENT_TEMPLATE_VERSION,
        generatedHtml: buildSellerMandateDocumentMarkup({ signingPack, formalPackApproval: approval }),
        generatedFileName: `seller-${mandateType === 'open' ? 'open' : 'exclusive'}-mandate-physical-signing.pdf`,
      },
    ].map((document) => ({
      ...document,
      signingRoute: approval.documentRoutes?.[document.key] || approval.signingRoute || 'manual_upload',
    })),
  }
  const current = record(existing)
  const previousVersions = Array.isArray(current.versionHistory) ? current.versionHistory : []
  const previousDocuments = Array.isArray(current.documents) && current.documents.some((document) => text(document?.versionId))
    ? [{ approvedAt: current.generatedAt, documents: current.documents }]
    : []
  return { contract: SELLER_ONBOARDING_MANUAL_SIGNING_PACK_CONTRACT, ...entry, history: [...(Array.isArray(current.history) ? current.history : []), { at: entry.generatedAt, actor: entry.generatedBy, status: entry.status }], versionHistory: [...previousVersions, ...previousDocuments] }
}
