import { buildFicaDeclarationDocumentMarkup } from './ficaDeclarationDocumentMarkup.js'

export const SELLER_ONBOARDING_MANUAL_SIGNING_PACK_CONTRACT = 'arch9-seller-onboarding-manual-signing-pack-v1'

const text = (value) => String(value ?? '').trim()
const record = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}

function escapeHtml(value = '') {
  return text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function mandateMarkup(signingPack = {}, approval = {}, generatedAt = '') {
  const pack = record(signingPack)
  const mandate = record(pack.mandate)
  const seller = record(pack.seller)
  const branding = record(pack.branding)
  const commission = record(approval.commission)
  const agency = text(branding.organisationName || branding.agencyName || 'Arch9')
  const commissionValue = commission.basis === 'fixed' ? `R ${text(commission.amount)}` : `${text(commission.percentage)}%`
  const signers = Array.isArray(pack.signers) ? pack.signers : []
  const signatureLines = signers.map((signer) => `<div class="line">${escapeHtml(signer.name)} (${escapeHtml(signer.role)}) — signature and date</div>`).join('')
  const specialConditions = text(mandate.specialConditions || mandate.mandateTerms)
  const mandatePeriod = [text(mandate.startDate), text(mandate.endDate)].filter(Boolean).join(' to ')
  return `<!doctype html><html><head><meta charset="utf-8" /><title>Seller mandate</title><style>body{margin:0;color:#172033;font:15px/1.55 Arial,sans-serif;background:#fff}.page{max-width:820px;margin:0 auto;padding:48px}.header{display:flex;justify-content:space-between;gap:24px;border-bottom:1px solid #dbe4df;padding-bottom:20px}.brand{font-size:20px;font-weight:800}.meta{color:#657488;font-size:12px;text-align:right}h1{margin:32px 0 8px;font-size:28px}.facts{border:1px solid #dbe4df;border-radius:10px;overflow:hidden}.facts div{display:grid;grid-template-columns:220px 1fr;gap:16px;padding:12px 16px;border-bottom:1px solid #e8eeeb}.facts div:last-child{border-bottom:0}.facts strong{color:#536174}.signature{margin-top:52px;display:grid;grid-template-columns:1fr 1fr;gap:34px}.line{border-top:1px solid #172033;padding-top:7px;min-height:50px}.footer{margin-top:36px;color:#6a7788;font-size:12px}</style></head><body><main class="page"><header class="header"><div class="brand">${escapeHtml(agency)}</div><div class="meta">Reviewed signing copy<br>${escapeHtml(generatedAt)}</div></header><h1>Seller mandate</h1><p>Prepared from the seller onboarding facts and commercial terms approved by the agent.</p><section class="facts"><div><strong>Seller / legal entity</strong><span>${escapeHtml(seller.name)}</span></div><div><strong>ID / registration</strong><span>${escapeHtml(seller.idNumber || seller.companyRegistrationNumber || seller.trustRegistrationNumber || 'Not captured')}</span></div><div><strong>Property</strong><span>${escapeHtml(mandate.propertyAddress || record(pack.property).address)}</span></div><div><strong>Mandate type</strong><span>${escapeHtml(mandate.mandateType || 'sole')}</span></div>${mandatePeriod ? `<div><strong>Mandate period</strong><span>${escapeHtml(mandatePeriod)}</span></div>` : ''}<div><strong>Asking price</strong><span>${escapeHtml(mandate.askingPrice)}</span></div><div><strong>Commission</strong><span>${escapeHtml(commissionValue)} ${escapeHtml(commission.vatHandling)}</span></div>${specialConditions ? `<div><strong>Special conditions</strong><span>${escapeHtml(specialConditions)}</span></div>` : ''}</section><p class="footer">This signing copy is not a signed mandate until every required signature is captured and reviewed.</p><section class="signature">${signatureLines}<div class="line">Agent signature and date</div></section></main></body></html>`
}

/** Creates printable, unsigned copies for a wet-ink route. */
export function createSellerOnboardingManualSigningPack({ existing = {}, formalPackApproval = {}, signingPack = {}, postOnboardingDrafts = {}, disclosureSigned = false, actor = '', generatedAt = new Date().toISOString() } = {}) {
  const approval = record(formalPackApproval)
  if (approval.status !== 'approved' || approval.signingRoute !== 'manual_upload') throw new Error('Approve the onboarding and choose the manual signing route before preparing physical copies.')
  const drafts = Array.isArray(record(postOnboardingDrafts).documents) ? postOnboardingDrafts.documents : []
  const ficaDraft = drafts.find((draft) => text(draft?.targetRequirementKey || draft?.requirementKey || draft?.key) === 'signed_fica_declaration')
  const disclosureDraft = drafts.find((draft) => text(draft?.targetRequirementKey || draft?.requirementKey || draft?.key) === 'signed_disclosure_form')
  if (!text(ficaDraft?.generatedHtml || ficaDraft?.generated_html)) throw new Error('The approved FICA declaration draft is unavailable.')
  if (!disclosureSigned && !text(disclosureDraft?.generatedHtml || disclosureDraft?.generated_html)) throw new Error('The approved disclosure draft is unavailable.')
  const ficaModel = record(record(ficaDraft?.metadata).ficaDeclarationModel)
  const reviewedFicaHtml = ficaModel.contract
    ? buildFicaDeclarationDocumentMarkup({
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
      })
    : ficaDraft.generatedHtml || ficaDraft.generated_html
  const entry = {
    generatedAt: text(generatedAt), generatedBy: text(actor), status: 'awaiting_signed_hard_copy',
    documents: [
      ...(!disclosureSigned ? [{ key: 'signed_disclosure_form', name: 'Mandatory Disclosure / Defects Form', generatedHtml: disclosureDraft.generatedHtml || disclosureDraft.generated_html, generatedFileName: 'seller-disclosure-physical-signing.pdf', sourceDraftFingerprint: disclosureDraft.contentFingerprint || '' }] : []),
      { key: 'signed_fica_declaration', name: 'Seller FICA Declaration', generatedHtml: reviewedFicaHtml, generatedFileName: 'seller-fica-declaration-physical-signing.pdf', sourceDraftFingerprint: ficaDraft.contentFingerprint || '' },
      { key: 'signed_mandate', name: 'Seller Mandate', generatedHtml: mandateMarkup(signingPack, approval, generatedAt), generatedFileName: 'seller-mandate-physical-signing.pdf' },
    ],
  }
  const current = record(existing)
  const previousVersions = Array.isArray(current.versionHistory) ? current.versionHistory : []
  const previousDocuments = Array.isArray(current.documents) && current.documents.some((document) => text(document?.versionId))
    ? [{ approvedAt: current.generatedAt, documents: current.documents }]
    : []
  return { contract: SELLER_ONBOARDING_MANUAL_SIGNING_PACK_CONTRACT, ...entry, history: [...(Array.isArray(current.history) ? current.history : []), { at: entry.generatedAt, actor: entry.generatedBy, status: entry.status }], versionHistory: [...previousVersions, ...previousDocuments] }
}
