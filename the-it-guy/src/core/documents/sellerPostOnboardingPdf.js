import { downloadHtmlDocumentPdf } from '../../lib/htmlDocumentPdf.js'

export const SELLER_POST_ONBOARDING_PDF_CONTRACT = 'arch9-seller-post-onboarding-pdf-v1'

const text = (value) => String(value ?? '').trim()

function normalizedKey(value = '') {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function draftFileName(draft = {}) {
  const key = normalizedKey(draft.artifactKey || draft.key || draft.requirementKey)
  if (key === 'signed_disclosure_form') return 'seller-disclosure-annexure-a.pdf'
  if (['fica_review_draft', 'signed_fica_declaration'].includes(key)) return 'seller-fica-declaration-draft.pdf'
  if (['mandate_preparation_summary', 'signed_mandate'].includes(key)) return 'mandate-preparation-summary.pdf'
  return 'seller-onboarding-document.pdf'
}

/**
 * PDF availability reflects the document's legal state. A captured
 * disclosure can be printed once complete; FICA and mandate drafts become
 * printable only after an agent has approved the submitted onboarding facts.
 */
export function getSellerPostOnboardingPdfAvailability(draft = {}, { agentReviewApproved = false, commissionConfirmed = false } = {}) {
  const key = normalizedKey(draft.artifactKey || draft.key || draft.requirementKey)
  const hasHtml = Boolean(text(draft.generatedHtml || draft.generated_html))
  const reviewOnly = key === 'mandate_preparation_summary' || draft?.metadata?.notForSignature === true
  const reviewRequired = ['fica_review_draft', 'signed_fica_declaration', 'signed_mandate'].includes(key)
  const commissionRequired = key === 'signed_mandate'
  // A preparation summary is review evidence, never a mandate to download or
  // sign. Only a separately generated formal signing pack may be delivered.
  const available = hasHtml && !reviewOnly && (!reviewRequired || agentReviewApproved) && (!commissionRequired || commissionConfirmed)
  return {
    contract: SELLER_POST_ONBOARDING_PDF_CONTRACT,
    key,
    available,
    fileName: draftFileName(draft),
    reason: !hasHtml
      ? 'Draft HTML is not available.'
      : reviewOnly
        ? 'This preparation summary is for agent review only. Generate the formal signing pack before downloading a mandate.'
      : reviewRequired && !agentReviewApproved
        ? 'Awaiting agent review before this draft can be downloaded.'
        : commissionRequired && !commissionConfirmed
          ? 'Awaiting commission confirmation before this mandate draft can be downloaded.'
        : '',
    signable: draft.signable === true,
    localOnly: true,
  }
}

export async function downloadSellerPostOnboardingDraftPdf(draft = {}, options = {}) {
  const availability = getSellerPostOnboardingPdfAvailability(draft, options)
  if (!availability.available) throw new Error(availability.reason)
  await downloadHtmlDocumentPdf(draft.generatedHtml || draft.generated_html, availability.fileName, {
    stageName: 'seller-post-onboarding-draft',
  })
  return availability
}
