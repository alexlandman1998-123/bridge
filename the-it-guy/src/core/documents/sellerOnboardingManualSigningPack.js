import { buildSellerMandateDocumentModel, requireSellerMandateWording } from './sellerMandateDocumentMarkup.js'
import { createSellerPostOnboardingDraftFingerprint } from './sellerPostOnboardingDrafts.js'
import { buildSellerFicaDueDiligenceMarkup, SELLER_FICA_DUE_DILIGENCE_TEMPLATE_VERSION } from './sellerFicaDueDiligenceMarkup.js'
import { buildSellerMandateDocumentMarkup, sellerMandateDocumentTemplateVersion } from './sellerMandateDocumentMarkup.js'
import { hasCompletedOnboardingDisclosureSignature } from './sellerDocumentSigningContract.js'
import { mandateSigningInputs, getMandateWordingRelease, mandateSigningInputsUnchanged } from './sellerMandateSigningApproval.js'

export const SELLER_ONBOARDING_MANUAL_SIGNING_PACK_CONTRACT = 'arch9-seller-onboarding-manual-signing-pack-v1'

const text = (value) => String(value ?? '').trim()
const record = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}

/** Creates the reviewed, unsigned copies shared by physical and portal signing. */
export function createSellerOnboardingManualSigningPack({ existing = {}, formalPackApproval = {}, signingPack = {}, postOnboardingDrafts = {}, formData = {}, disclosureSigned = hasCompletedOnboardingDisclosureSignature(formData), actor = '', generatedAt = new Date().toISOString() } = {}) {
  const approval = record(formalPackApproval)
  if (approval.status !== 'approved') throw new Error('Approve the onboarding before preparing signing copies.')
  const drafts = Array.isArray(record(postOnboardingDrafts).documents) ? postOnboardingDrafts.documents : []
  const ficaDraft = drafts.find((draft) => text(draft?.targetRequirementKey || draft?.requirementKey || draft?.key) === 'signed_fica_declaration')
  const selected = Array.isArray(approval.selectedDocuments) ? approval.selectedDocuments : ['fica', 'mandate']
  const includeFica = selected.includes('fica')
  const includeMandate = selected.includes('mandate')
  if (!includeFica && !includeMandate) throw new Error('Choose FICA or the mandate before preparing signing copies.')
  if (includeFica && !ficaDraft) throw new Error('The approved FICA declaration draft is unavailable.')
  const disclosureComplete = disclosureSigned === true
  const disclosureDraft = drafts.find((draft) => text(draft?.targetRequirementKey || draft?.requirementKey || draft?.key) === 'signed_disclosure_form')
  if (!disclosureComplete && approval.documentRoutes?.signed_disclosure_form && !text(disclosureDraft?.generatedHtml)) {
    throw new Error('The reviewed defects disclosure is unavailable. Rebuild the onboarding drafts before sending it for signature.')
  }
  const mandateType = text(record(signingPack.mandate).mandateType).toLowerCase()
  const mandateVariant = includeMandate ? requireSellerMandateWording(mandateType) : ''
  const mandateName = { open: 'Open Mandate to Sell', exclusive: 'Exclusive Mandate to Sell', dual: 'Dual Mandate to Sell' }[mandateVariant]
  const ficaModel = record(record(ficaDraft?.metadata).ficaDeclarationModel)
  const entry = {
    generatedAt: text(generatedAt), generatedBy: text(actor), status: Object.values(approval.documentRoutes || {}).includes('digital_pack') || approval.signingRoute === 'digital_pack' ? 'awaiting_signature' : 'awaiting_signed_hard_copy',
    signingPackSnapshot: structuredClone(signingPack),
    documents: [
      ...(!disclosureComplete && text(disclosureDraft?.generatedHtml) ? [{
        key: 'signed_disclosure_form', name: 'Mandatory Disclosure / Defects Form',
        templateVersion: text(disclosureDraft.templateVersion || disclosureDraft.version),
        generatedHtml: disclosureDraft.generatedHtml,
        generatedFileName: 'seller-defects-disclosure-signing.pdf',
        sourceDraftFingerprint: text(disclosureDraft.fingerprint || disclosureDraft.sourceDraftFingerprint),
      }] : []),
      ...(includeFica ? [{
        key: 'signed_fica_declaration', name: 'Seller FICA Due Diligence Record',
        templateVersion: SELLER_FICA_DUE_DILIGENCE_TEMPLATE_VERSION,
        sourceFactsFingerprint: ficaFactsFingerprint(ficaDraft),
        generatedHtml: buildSellerFicaDueDiligenceMarkup({ model: ficaModel, formData, signingPack, branding: signingPack.branding, generatedAt }),
        generatedFileName: 'seller-fica-due-diligence-physical-signing.pdf',
      }] : []),
      ...(includeMandate ? [{
        key: 'signed_mandate', name: mandateName,
        templateVersion: sellerMandateDocumentTemplateVersion(signingPack),
        sourceFactsFingerprint: mandateFactsFingerprint(signingPack, approval),
        generatedHtml: buildSellerMandateDocumentMarkup({ signingPack, approval, generatedAt }),
        generatedFileName: `seller-${mandateVariant}-mandate-physical-signing.pdf`,
      }] : []),
    ].map((document) => ({
      ...document,
      signingRoute: approval.documentRoutes?.[document.key] || approval.signingRoute || 'manual_upload',
    })),
  }
  const current = record(existing)
  retainUnselectedCopies({ entry, current, includeFica, includeMandate, disclosureComplete, ficaDraft, signingPack, approval })
  const previousVersions = Array.isArray(current.versionHistory) ? current.versionHistory : []
  const previousDocuments = Array.isArray(current.documents) && current.documents.some((document) => text(document?.versionId))
    ? [{ approvedAt: current.generatedAt, documents: current.documents }]
    : []
  return { contract: SELLER_ONBOARDING_MANUAL_SIGNING_PACK_CONTRACT, ...entry, history: [...(Array.isArray(current.history) ? current.history : []), { at: entry.generatedAt, actor: entry.generatedBy, status: entry.status }], versionHistory: [...previousVersions, ...previousDocuments] }
}

function ficaFactsFingerprint(draft) {
  const model = record(record(draft?.metadata).ficaDeclarationModel)
  if (!model.contract) return ''
  return createSellerPostOnboardingDraftFingerprint({
    contract: model.contract,
    partyType: model.partyType,
    documentReference: model.documentReference,
    partyName: model.partyName,
    sections: model.sections,
    declaration: model.declaration,
    branding: model.branding,
  })
}

function mandateFactsFingerprint(signingPack, approval) {
  if (signingPack.mandate?.mandateCapture !== undefined) return createSellerPostOnboardingDraftFingerprint({ inputs: mandateSigningInputs(signingPack), wordingDigest: getMandateWordingRelease(signingPack.mandate)?.wordingDigest })
  const model = buildSellerMandateDocumentModel({ signingPack, approval, generatedAt: 'fingerprint' })
  delete model.generatedAt
  return createSellerPostOnboardingDraftFingerprint(model)
}

function retainUnselectedCopies({ entry, current, includeFica, includeMandate, disclosureComplete, ficaDraft, signingPack, approval }) {
  const freshKeys = new Set(entry.documents.map((document) => document.key))
  const retainedKeys = new Set([
    ...(disclosureComplete ? ['signed_disclosure_form'] : []),
    ...(!includeFica ? ['signed_fica_declaration'] : []),
    ...(!includeMandate && approval.mandateSource !== 'agency_upload' ? ['signed_mandate'] : []),
  ])
  const retained = (Array.isArray(current.documents) ? current.documents : []).filter((document) =>
    retainedKeys.has(text(document?.key)) && !freshKeys.has(text(document?.key)) &&
    text(document?.versionId) && text(document?.versionDigest) && text(document?.generatedHtml || document?.generated_html),
  )
  const currentFicaFacts = ficaFactsFingerprint(ficaDraft)
  if (currentFicaFacts && retained.some((document) => text(document.key) === 'signed_fica_declaration' && text(document.sourceFactsFingerprint) !== currentFicaFacts)) {
    throw new Error('The seller FICA details changed. Include FICA in this signing pack for review.')
  }
  if (retained.some((document) => {
    if (text(document.key) !== 'signed_mandate') return false
    if (document.mandateContract) return !mandateSigningInputsUnchanged(document.mandateContract, signingPack)
    const oldSnapshot = record(current.signingPackSnapshot)
    const previousFingerprint = text(document.sourceFactsFingerprint) || (Object.keys(oldSnapshot).length ? mandateFactsFingerprint(oldSnapshot, approval) : '')
    return Boolean(previousFingerprint) && previousFingerprint !== mandateFactsFingerprint(signingPack, approval)
  })) {
    throw new Error('The mandate details changed. Include the mandate in this signing pack for review.')
  }
  entry.documents.push(...retained)
}

/** One reviewed content pack powers download and portal signing. */
export function createSellerOnboardingSigningCopyPack({ existing = {}, formalPackApproval = {}, signingPack = {}, postOnboardingDrafts = {}, disclosureSigned = false, actor = '', generatedAt = new Date().toISOString() } = {}) {
  const approval = record(formalPackApproval)
  if (approval.status !== 'approved' || !['manual_upload', 'digital_pack'].includes(approval.signingRoute)) throw new Error('Approve the onboarding and choose a signing route before preparing the copies.')
  const selected = Array.isArray(approval.selectedDocuments) ? approval.selectedDocuments.map(text) : ['fica', 'mandate']
  const includeFica = selected.includes('fica')
  const includeMandate = selected.includes('mandate')
  if (!includeFica && !includeMandate) throw new Error('Choose FICA or the mandate before preparing signing copies.')
  const drafts = Array.isArray(record(postOnboardingDrafts).documents) ? postOnboardingDrafts.documents : []
  const ficaDraft = drafts.find((draft) => text(draft?.targetRequirementKey || draft?.requirementKey || draft?.key) === 'signed_fica_declaration')
  const disclosureDraft = drafts.find((draft) => text(draft?.targetRequirementKey || draft?.requirementKey || draft?.key) === 'signed_disclosure_form')
  if (includeFica && !text(ficaDraft?.generatedHtml || ficaDraft?.generated_html)) throw new Error('The approved FICA declaration draft is unavailable.')
  if (!disclosureSigned && !text(disclosureDraft?.generatedHtml || disclosureDraft?.generated_html)) throw new Error('The approved disclosure draft is unavailable.')
  const ficaModel = record(record(ficaDraft?.metadata).ficaDeclarationModel)
  const reviewedFicaHtml = includeFica && ficaModel.contract
    ? buildSellerFicaDueDiligenceMarkup({ model: {
        ...ficaModel,
        signers: (Array.isArray(signingPack?.signers) ? signingPack.signers : []).map((signer, index) => ({
          id: `signer-${index + 1}`,
          name: text(signer?.name),
          roleLabel: text(signer?.role) || 'Seller',
          email: text(signer?.email),
          status: 'Awaiting signature',
          signedAt: '',
          signature: '',
        })),
      }, signingPack, branding: signingPack.branding, generatedAt })
    : ficaDraft?.generatedHtml || ficaDraft?.generated_html || ''
  const current = record(existing)
  const entry = {
    generatedAt: text(generatedAt), generatedBy: text(actor), signingRoute: approval.signingRoute,
    signingPackSnapshot: structuredClone(signingPack),
    status: approval.signingRoute === 'manual_upload' ? 'awaiting_signed_hard_copy' : 'ready_for_portal_signature',
    documents: [
      ...(!disclosureSigned ? [{ key: 'signed_disclosure_form', name: 'Mandatory Disclosure / Defects Form', templateVersion: text(disclosureDraft.templateVersion), generatedHtml: disclosureDraft.generatedHtml || disclosureDraft.generated_html, generatedFileName: 'seller-disclosure-physical-signing.pdf', sourceDraftFingerprint: disclosureDraft.contentFingerprint || '' }] : []),
      ...(includeFica ? [{ key: 'signed_fica_declaration', name: 'Seller FICA Declaration', templateVersion: SELLER_FICA_DUE_DILIGENCE_TEMPLATE_VERSION, generatedHtml: reviewedFicaHtml, generatedFileName: 'seller-fica-declaration-signing.pdf', sourceDraftFingerprint: ficaDraft.contentFingerprint || '', sourceFactsFingerprint: ficaFactsFingerprint(ficaDraft) }] : []),
      ...(includeMandate ? [{ key: 'signed_mandate', name: 'Seller Mandate', templateVersion: sellerMandateDocumentTemplateVersion(signingPack), generatedHtml: buildSellerMandateDocumentMarkup({ signingPack, approval, generatedAt }), generatedFileName: 'seller-mandate-signing.pdf', sourceFactsFingerprint: mandateFactsFingerprint(signingPack, approval) }] : []),
    ],
  }
  retainUnselectedCopies({ entry, current, includeFica, includeMandate, disclosureComplete: disclosureSigned === true, ficaDraft, signingPack, approval })
  const previousVersions = Array.isArray(current.versionHistory) ? current.versionHistory : []
  const previousDocuments = Array.isArray(current.documents) && current.documents.some((document) => text(document?.versionId))
    ? [{ approvedAt: current.generatedAt, documents: current.documents }]
    : []
  return { contract: SELLER_ONBOARDING_MANUAL_SIGNING_PACK_CONTRACT, ...entry, history: [...(Array.isArray(current.history) ? current.history : []), { at: entry.generatedAt, actor: entry.generatedBy, status: entry.status }], versionHistory: [...previousVersions, ...previousDocuments] }
}
