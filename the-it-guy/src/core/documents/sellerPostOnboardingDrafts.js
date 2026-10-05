import { readSellerMandateTerms } from '../../lib/sellerMandateCapture.js'
import { getMandateWordingRelease } from './sellerMandateSigningApproval.js'
import { buildSellerMandateReviewDocumentMarkup } from './sellerMandateReviewDocumentMarkup.js'
import { buildFicaDeclarationDocumentModel } from './ficaDeclarationDocumentModel.js'
import { buildSellerFicaDueDiligenceMarkup, SELLER_FICA_DUE_DILIGENCE_TEMPLATE_VERSION } from './sellerFicaDueDiligenceMarkup.js'
import { buildSellerComplianceDocumentModel } from './sellerComplianceDocumentModel.js'
import { buildPropertyDisclosureDocumentMarkup } from '../../lib/propertyDisclosure.js'
import { buildSellerSigningPlan } from '../../lib/sellerSigningPlanModel.js'
import { buildSellerOnboardingSigningPackSnapshot } from './sellerOnboardingSigningPackSnapshot.js'
import {
  SELLER_BASE_PACK_KEYS,
  SELLER_DOCUMENT_ARTIFACT_KEYS,
  SELLER_DOCUMENT_ARTIFACT_STAGES,
  SELLER_DOCUMENT_CONTRACT_VERSION,
} from '../../lib/sellerBasePackContract.js'

export const SELLER_POST_ONBOARDING_DRAFTS_CONTRACT = 'arch9-seller-post-onboarding-drafts-v3'

const text = (value) => String(value ?? '').trim()
const record = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}

function firstText(...values) {
  return values.map(text).find(Boolean) || ''
}

function escapeHtml(value = '') {
  return text(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => ({ ...result, [key]: stableValue(value[key]) }), {})
  }
  return value
}

// This is a change-detection fingerprint, not a cryptographic signature.
export function createSellerPostOnboardingDraftFingerprint(value) {
  const input = JSON.stringify(stableValue(value))
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a-32:${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function sellerName(formData = {}, listing = {}) {
  return firstText(
    [formData.sellerFirstName, formData.sellerSurname].filter(Boolean).join(' '),
    formData.sellerName,
    listing?.seller?.name,
    listing?.sellerName,
    'Seller',
  )
}

function propertyAddress(formData = {}, listing = {}) {
  const address = record(formData.propertyAddress || formData.property_address)
  return firstText(
    [address.line1 || address.line_1, address.line2 || address.line_2, address.suburb, address.city || address.town, address.province, address.postalCode || address.postal_code].filter(Boolean).join(', '),
    typeof formData.propertyAddress === 'string' ? formData.propertyAddress : '',
    typeof formData.property_address === 'string' ? formData.property_address : '',
    formData.propertyAddressText,
    formData.property_address_text,
    listing?.propertyAddress,
    listing?.address,
    'Property details pending',
  )
}

function documentReference(listing = {}) {
  return firstText(
    listing.listingReference,
    listing.listing_reference,
    listing.reference,
    listing.privateListingReference,
    listing.private_listing_reference,
    listing.id,
  )
}

function mandatePreparationMarkup({ seller, sellerId, property, reference, branding = {}, generatedAt }) {
  const agency = firstText(branding.organisationName, branding.organizationName, branding.agencyName, 'Agency')
  const logo = firstText(branding.logoDarkUrl, branding.logo_dark_url, branding.logoUrl, branding.logo_url, branding.logoLightUrl, branding.logo_light_url)
  const brand = logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(agency)}" />` : escapeHtml(agency)
  return `<!doctype html><html><head><meta charset="utf-8" /><title>Mandate preparation summary</title><style>body{margin:0;color:#172033;font:15px/1.55 Georgia,'Times New Roman',serif;background:#fff}.page{max-width:820px;margin:0 auto;padding:48px}.header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #dbe4df;padding-bottom:22px}.brand{font-size:20px;font-weight:800}.brand img{max-width:220px;max-height:62px;object-fit:contain}.notice{margin:32px 0;padding:18px 20px;border:1px solid #f2c46e;background:#fff8e9;border-radius:10px;color:#704b00}.facts{border:1px solid #dbe4df;border-radius:10px;overflow:hidden}.facts div{display:grid;grid-template-columns:210px 1fr;gap:16px;padding:13px 16px;border-bottom:1px solid #e8eeeb}.facts div:last-child{border-bottom:0}.facts strong{color:#536174}h1{margin:32px 0 8px;font-size:27px}p{margin:8px 0}.footer{margin-top:34px;color:#6a7788;font-size:12px}</style></head><body><main class="page"><header class="header"><div class="brand">${brand}</div><span>Draft generated ${escapeHtml(generatedAt)}</span></header><h1>Mandate preparation summary</h1><p>This is a frozen summary of the submitted onboarding facts for the agent’s review.</p><aside class="notice"><strong>Not for signature.</strong> Commission, mandate terms, and any agency-specific conditions must be approved by the agent before a signable mandate is created or sent.</aside><section class="facts"><div><strong>Seller</strong><span>${escapeHtml(seller)}</span></div><div><strong>ID / passport</strong><span>${escapeHtml(sellerId || 'Not captured')}</span></div><div><strong>Property</strong><span>${escapeHtml(property)}</span></div><div><strong>Reference</strong><span>${escapeHtml(reference || 'Pending')}</span></div><div><strong>Commission structure</strong><span>To be confirmed by the agent</span></div></section><p class="footer">Template: seller_mandate_preparation_summary_v1</p></main></body></html>`
}

function draftDocument({ key, targetRequirementKey = key, artifactStage = SELLER_DOCUMENT_ARTIFACT_STAGES.REVIEW_DRAFT, name, status, templateVersion, brandingVersion, generatedAt, generatedHtml, signable = false, source = 'seller_onboarding.post_submission_draft', metadata = {} }) {
  const fingerprint = createSellerPostOnboardingDraftFingerprint({ key, templateVersion, brandingVersion, generatedAt, generatedHtml })
  return {
    key,
    artifactKey: key,
    targetRequirementKey,
    requirementKey: targetRequirementKey,
    artifactStage,
    documentContractVersion: SELLER_DOCUMENT_CONTRACT_VERSION,
    name,
    status,
    generatedAt,
    templateVersion,
    brandingVersion,
    generatedHtml,
    contentFingerprint: fingerprint,
    signable,
    source,
    metadata,
  }
}

/**
 * Freezes review-only HTML drafts at onboarding submission. These are not
 * delivery artefacts and deliberately do not advance the signing lifecycle.
 */
export function buildSellerPostOnboardingDrafts({ formData = {}, listing = {}, branding = {}, generatedAt = new Date().toISOString() } = {}) {
  const safeFormData = record(formData)
  const safeListing = record(listing)
  const safeBranding = record(branding)
  const capturedSeller = buildSellerOnboardingSigningPackSnapshot({ formData: safeFormData, listing: safeListing }).seller
  const owners = capturedSeller.ownershipType === 'multiple_owners' ? capturedSeller.parties.filter((person) => ['seller', 'owner'].includes(text(person.role).toLowerCase())) : []
  const seller = owners.length ? owners.map((person) => person.name).join(', ') : firstText(capturedSeller.legalOwnerName, sellerName(safeFormData, safeListing))
  const sellerId = owners.length ? owners.map((person) => person.idNumber).filter(Boolean).join(' / ') : capturedSeller.legalOwnerIdentity
  const property = propertyAddress(safeFormData, safeListing)
  const reference = documentReference(safeListing)
  const disclosure = record(safeFormData.propertyDisclosure || safeFormData.property_disclosure)
  const signingPlan = buildSellerSigningPlan({
    sellerType: firstText(safeFormData.sellerLegalType, safeFormData.seller_legal_type, safeFormData.sellerType, safeListing.sellerType),
    form: safeFormData,
  })
  const compliancePack = buildSellerComplianceDocumentModel({
    formData: safeFormData,
    listing: safeListing,
    signing: { signers: signingPlan.recipients.map((signer) => ({ ...signer, status: 'pending', signature: '' })) },
    generatedAt,
  })
  const ficaModel = buildFicaDeclarationDocumentModel({
    partyType: 'seller',
    party: { name: seller, idNumber: sellerId, email: safeFormData.email, mobile: firstText(safeFormData.mobile, safeFormData.phone) },
    transaction: { reference },
    property: { address: property },
    signing: { signers: compliancePack.signers },
    sections: compliancePack.ficaSections,
    branding: safeBranding,
    declaration: {
      wording: safeFormData.ficaDeclarationWording || safeFormData.fica_declaration_wording,
      wordingVersion: safeFormData.ficaDeclarationWordingVersion || safeFormData.fica_declaration_wording_version,
    },
    generatedAt,
  })
  const disclosureHtml = buildPropertyDisclosureDocumentMarkup(disclosure, {
    sellerName: seller,
    sellerIdNumber: sellerId,
    sellerIdentityLabel: ['company', 'close_corporation', 'foreign_company', 'trust', 'foreign_trust', 'other', 'deceased_estate'].includes(capturedSeller.ownershipType) ? 'registration / estate reference' : 'ID/passport number',
    propertyAddress: property,
    listingId: text(safeListing.id),
    documentReference: reference,
    branding: safeBranding,
    compliancePack: { signers: compliancePack.signers },
  })
  const ficaHtml = buildSellerFicaDueDiligenceMarkup({ model: ficaModel, formData: safeFormData, branding: safeBranding, generatedAt })
  const legacyMandateHtml = mandatePreparationMarkup({ seller, sellerId, property, reference, branding: safeBranding, generatedAt })
  const brandingVersion = firstText(
    safeBranding.brandingVersion,
    safeBranding.branding_version,
    safeBranding.version,
    'seller_onboarding_branding_snapshot_v1',
  )
  const brandingSnapshotBase = {
    contract: 'arch9-seller-document-branding-snapshot-v1',
    frozenAt: generatedAt,
    organisationName: firstText(safeBranding.organisationName, safeBranding.agencyName),
    logoUrl: firstText(safeBranding.logoDarkUrl, safeBranding.logoUrl, safeBranding.logoLightUrl),
    logoLightUrl: firstText(safeBranding.logoLightUrl, safeBranding.logoUrl),
    logoDarkUrl: firstText(safeBranding.logoDarkUrl, safeBranding.logoUrl),
    logoIconUrl: firstText(safeBranding.logoIconUrl),
    primaryColour: firstText(safeBranding.primaryColour, safeBranding.primaryColor),
    secondaryColour: firstText(safeBranding.secondaryColour, safeBranding.secondaryColor),
    accentColour: firstText(safeBranding.accentColour, safeBranding.accentColor),
    brandingVersion,
  }
  const brandingSnapshot = {
    ...brandingSnapshotBase,
    fingerprint: createSellerPostOnboardingDraftFingerprint(brandingSnapshotBase),
  }
  const mandateReviewSnapshot = safeFormData.mandateCapture === undefined ? null : buildSellerOnboardingSigningPackSnapshot({
    formData: safeFormData, listing: safeListing, recipients: signingPlan.recipients,
    mandate: readSellerMandateTerms(safeFormData), branding: safeBranding, generatedAt,
  })
  if (mandateReviewSnapshot) {
    mandateReviewSnapshot.documentReference = reference
    mandateReviewSnapshot.disclosureReference = safeFormData.mandateAcceptanceReview?.disclosureReference || ''
  }
  const mandateRelease = mandateReviewSnapshot ? getMandateWordingRelease(mandateReviewSnapshot.mandate) : null
  const mandateHtml = mandateReviewSnapshot && mandateRelease
    ? buildSellerMandateReviewDocumentMarkup({ signingPack: mandateReviewSnapshot, draftMarkdown: mandateRelease.markdown, generatedAt })
    : legacyMandateHtml
  const source = {
    onboardingVersion: firstText(safeFormData.sellerOnboardingCompletion?.version, safeFormData.seller_onboarding_completion?.version, 'seller_onboarding_submission_v1'),
    onboardingSubmittedAt: firstText(safeFormData.sellerOnboardingCompletion?.completedAt, safeFormData.sellerOnboardingCompletion?.completed_at, safeFormData.seller_onboarding_completion?.completedAt, safeFormData.seller_onboarding_completion?.completed_at),
    generatedAt,
  }

  return {
    contract: SELLER_POST_ONBOARDING_DRAFTS_CONTRACT,
    generatedAt,
    source,
    brandingVersion,
    brandingSnapshot,
    documents: [
      draftDocument({ key: SELLER_BASE_PACK_KEYS.SIGNED_DISCLOSURE_FORM, targetRequirementKey: SELLER_BASE_PACK_KEYS.SIGNED_DISCLOSURE_FORM, artifactStage: SELLER_DOCUMENT_ARTIFACT_STAGES.REVIEW_DRAFT, name: 'Mandatory Disclosure / Defects Form', status: 'awaiting_agent_review', templateVersion: 'property_disclosure_annexure_a_v2', brandingVersion, generatedAt, generatedHtml: disclosureHtml, metadata: { source: 'seller_onboarding', brandingSnapshot } }),
      draftDocument({ key: SELLER_DOCUMENT_ARTIFACT_KEYS.FICA_REVIEW_DRAFT, targetRequirementKey: SELLER_BASE_PACK_KEYS.SIGNED_FICA_DECLARATION, name: 'Seller FICA review draft', status: 'awaiting_agent_review', templateVersion: SELLER_FICA_DUE_DILIGENCE_TEMPLATE_VERSION, brandingVersion, generatedAt, generatedHtml: ficaHtml, metadata: { ficaDeclarationModel: ficaModel, wordingVersion: ficaModel.declaration.wordingVersion, brandingSnapshot } }),
      draftDocument({ key: SELLER_DOCUMENT_ARTIFACT_KEYS.MANDATE_PREPARATION_SUMMARY, targetRequirementKey: SELLER_BASE_PACK_KEYS.SIGNED_MANDATE, name: mandateReviewSnapshot ? 'Full mandate review draft' : 'Mandate preparation summary', status: 'awaiting_agent_review', templateVersion: mandateRelease?.version || 'seller_mandate_preparation_summary_v1', brandingVersion, generatedAt, generatedHtml: mandateHtml, metadata: { commissionPending: true, notForSignature: true, ...(mandateRelease ? { wordingDigest: mandateRelease.wordingDigest } : {}), brandingSnapshot } }),
    ],
  }
}

export default buildSellerPostOnboardingDrafts
