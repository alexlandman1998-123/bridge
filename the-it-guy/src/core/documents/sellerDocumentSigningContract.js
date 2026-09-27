import { SELLER_BASE_PACK_KEYS, normalizeSellerBasePackKey } from '../../lib/sellerBasePackContract.js'
import { isPropertyDisclosureDigitallyComplete } from '../../lib/propertyDisclosure.js'
import { isElectronicSigningApproved } from './signingClassificationPolicy.js'
import { ONLINE_SIGNING_DISABLED } from './onlineSigningPolicy.js'

export const SELLER_DOCUMENT_SIGNING_CONTRACT = 'arch9-seller-document-signing-v1'

export const SELLER_DOCUMENT_SIGNING_ROUTES = Object.freeze({
  GENERATE_DOWNLOAD: 'generate_download',
  SEND_FOR_SIGNATURE: 'send_for_signature',
})

export const SELLER_DOCUMENT_SIGNING_STATES = Object.freeze({
  DRAFT: 'draft',
  AWAITING_AGENT_REVIEW: 'awaiting_agent_review',
  READY: 'ready',
  AWAITING_SIGNATURE: 'awaiting_signature',
  SIGNED: 'signed',
  REVIEWED: 'reviewed',
})

export const SELLER_DOCUMENT_SIGNING_DEFINITIONS = Object.freeze({
  [SELLER_BASE_PACK_KEYS.SIGNED_DISCLOSURE_FORM]: Object.freeze({
    workflowKey: 'seller_disclosure',
    requiresCommercialTerms: false,
  }),
  [SELLER_BASE_PACK_KEYS.SIGNED_FICA_DECLARATION]: Object.freeze({
    workflowKey: 'seller_fica_declaration',
    requiresCommercialTerms: false,
  }),
  [SELLER_BASE_PACK_KEYS.SIGNED_MANDATE]: Object.freeze({
    workflowKey: 'seller_mandate',
    requiresCommercialTerms: true,
  }),
})

const text = (value) => String(value ?? '').trim()

const signersKnown = (signers) => Array.isArray(signers) && signers.length > 0 &&
  signers.every((signer) => text(signer?.name) && text(signer?.role))

/** Onboarding may sign the disclosure, but submission alone is not evidence. */
export function hasCompletedOnboardingDisclosureSignature(formData = {}) {
  const disclosure = formData?.propertyDisclosure || formData?.property_disclosure || {}
  if (!isPropertyDisclosureDigitallyComplete(disclosure)) return false
  const compliance = formData?.sellerComplianceSigning || formData?.seller_compliance_signing
  if (compliance && typeof compliance === 'object') {
    return compliance.complete === true || compliance.signingState?.complete === true
  }
  // Older single-seller records predate the separate signer matrix.
  return true
}

export function getSellerDocumentSigningDefinition(documentKey = '') {
  const key = normalizeSellerBasePackKey(documentKey)
  return key ? SELLER_DOCUMENT_SIGNING_DEFINITIONS[key] || null : null
}

/** Both routes start from the same reviewed, frozen document version. */
export function getSellerDocumentSigningRouteReadiness({
  documentKey = '',
  route = '',
  onboardingSubmitted = false,
  agentReviewed = false,
  finalVersionId = '',
  finalVersionDigest = '',
  commercialTermsConfirmed = false,
  requiredSigners = [],
} = {}) {
  const definition = getSellerDocumentSigningDefinition(documentKey)
  const reasons = []
  if (!definition) reasons.push('unsupported_document')
  if (!Object.values(SELLER_DOCUMENT_SIGNING_ROUTES).includes(route)) reasons.push('unsupported_route')
  if (!onboardingSubmitted) reasons.push('onboarding_not_submitted')
  if (!agentReviewed) reasons.push('agent_review_required')
  if (!text(finalVersionId) || !text(finalVersionDigest)) reasons.push('final_version_required')
  if (definition?.requiresCommercialTerms && !commercialTermsConfirmed) reasons.push('commercial_terms_required')
  if (!signersKnown(requiredSigners)) reasons.push('required_signers_missing')

  if (route === SELLER_DOCUMENT_SIGNING_ROUTES.SEND_FOR_SIGNATURE) {
    if (!definition || !isElectronicSigningApproved(definition.workflowKey)) reasons.push('legal_approval_required')
    if (ONLINE_SIGNING_DISABLED) reasons.push('portal_signing_not_enabled')
    if (Array.isArray(requiredSigners) && requiredSigners.some((signer) => !text(signer?.email))) reasons.push('signer_delivery_missing')
  }

  return Object.freeze({
    contract: SELLER_DOCUMENT_SIGNING_CONTRACT,
    documentKey: normalizeSellerBasePackKey(documentKey) || text(documentKey),
    route,
    ready: reasons.length === 0,
    reasons: Object.freeze(reasons),
  })
}

/** A downloaded copy, sent link, or onboarding submission is never signature evidence. */
export function getSellerDocumentSigningState({
  documentKey = '',
  onboardingSubmitted = false,
  agentReviewed = false,
  finalVersionId = '',
  finalVersionDigest = '',
  commercialTermsConfirmed = false,
  requiredSigners = [],
  issuedRoute = '',
  issuedVersionId = '',
  issuedVersionDigest = '',
  signedEvidence = {},
  reviewedAt = '',
  reviewedBy = '',
} = {}) {
  const canonicalKey = normalizeSellerBasePackKey(documentKey)
  const definition = getSellerDocumentSigningDefinition(canonicalKey)
  if (!definition) {
    throw new Error('A seller signing state requires a supported seller document.')
  }

  let state = SELLER_DOCUMENT_SIGNING_STATES.DRAFT
  const versionIsReady = Boolean(text(finalVersionId) && text(finalVersionDigest))
  const routeIssued = Object.values(SELLER_DOCUMENT_SIGNING_ROUTES).includes(issuedRoute) &&
    text(issuedVersionId) === text(finalVersionId) &&
    text(issuedVersionDigest) === text(finalVersionDigest)
  const evidenceMatchesVersion = Boolean(routeIssued &&
    text(signedEvidence?.documentVersionId) === text(finalVersionId) &&
    text(signedEvidence?.documentVersionDigest) === text(finalVersionDigest) &&
    text(signedEvidence?.artifactId) &&
    signedEvidence?.allRequiredSignersComplete === true)

  if (onboardingSubmitted) {
    state = agentReviewed && versionIsReady && signersKnown(requiredSigners) &&
      (!definition.requiresCommercialTerms || commercialTermsConfirmed)
      ? SELLER_DOCUMENT_SIGNING_STATES.READY
      : SELLER_DOCUMENT_SIGNING_STATES.AWAITING_AGENT_REVIEW
    if (state === SELLER_DOCUMENT_SIGNING_STATES.READY && routeIssued) {
      state = evidenceMatchesVersion
        ? text(reviewedAt) && text(reviewedBy)
          ? SELLER_DOCUMENT_SIGNING_STATES.REVIEWED
          : SELLER_DOCUMENT_SIGNING_STATES.SIGNED
        : SELLER_DOCUMENT_SIGNING_STATES.AWAITING_SIGNATURE
    }
  }

  return Object.freeze({
    contract: SELLER_DOCUMENT_SIGNING_CONTRACT,
    documentKey: canonicalKey,
    state,
    route: routeIssued ? issuedRoute : '',
    finalVersionId: text(finalVersionId),
  })
}
