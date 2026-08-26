import { SELLER_BASE_PACK_KEYS, normalizeSellerBasePackKey } from '../../lib/sellerBasePackContract.js'

export const SELLER_COMPLIANCE_AGENT_STATUS_MODEL_CONTRACT = 'arch9-seller-compliance-agent-status-model-v1'

const SIGNED_MANDATE_STATUSES = new Set([
  'signed',
  'signed_uploaded',
  'uploaded_signed',
  'fully_signed',
  'completed',
  'complete',
  'approved',
  'verified',
])

const LIVE_LISTING_STATUSES = new Set([
  'active',
  'active_market',
  'listing_active',
  'listing_live',
  'live',
  'published',
])

function text(value) {
  return String(value || '').trim()
}

function key(value) {
  return text(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function firstText(...values) {
  return values.map(text).find(Boolean) || ''
}

function hasDocumentFile(document = null) {
  return Boolean(
    document &&
      (
        document.file_path ||
        document.filePath ||
        document.storage_path ||
        document.storagePath ||
        document.url ||
        document.file_url ||
        document.fileUrl ||
        document.public_url ||
        document.publicUrl ||
        document.uploadedDocumentId ||
        document.uploaded_document_id
      ),
  )
}

function documentSearchText(document = {}) {
  return [
    document.key,
    document.requirementKey,
    document.requirement_key,
    document.canonicalDocumentRequestKey,
    document.canonical_document_request_key,
    document.document_type,
    document.documentType,
    document.category,
    document.document_category,
    document.name,
    document.document_name,
    document.label,
    document.requirement_name,
  ].filter(Boolean).join(' ')
}

function isCanonicalDocument(document = {}, canonicalKey = '') {
  const normalized = key(documentSearchText(document))
  return normalizeSellerBasePackKey(normalized) === canonicalKey ||
    normalized.includes(canonicalKey) ||
    toArray(document.requirementKeys).some((item) => normalizeSellerBasePackKey(item) === canonicalKey) ||
    toArray(document.requirement_keys).some((item) => normalizeSellerBasePackKey(item) === canonicalKey)
}

function getDocumentStatus(document = {}) {
  return key(document.status || document.documentStatus || document.document_status || document.requiredDocumentStatus || document.required_document_status)
}

function isRequirementComplete(requirement = {}) {
  const status = getDocumentStatus(requirement)
  return Boolean(
    requirement.complete ||
      requirement.completed ||
      requirement.isUploaded ||
      requirement.is_uploaded ||
      requirement.uploadedDocumentId ||
      requirement.uploaded_document_id ||
      ['completed', 'complete', 'approved', 'uploaded', 'received', 'verified'].includes(status),
  )
}

function hasCompletedRequirement(requirements = [], canonicalKey = '') {
  return toArray(requirements).some((requirement) =>
    isCanonicalDocument(requirement, canonicalKey) && isRequirementComplete(requirement),
  )
}

function hasUploadedDocument(documents = [], canonicalKey = '') {
  return toArray(documents).some((document) =>
    isCanonicalDocument(document, canonicalKey) && hasDocumentFile(document),
  )
}

function getMandateStatusFromSources({ listing = {}, activeSellingContext = {}, portal = {} } = {}) {
  return key(
    firstText(
      listing.mandateStatus,
      listing.mandate_status,
      listing.mandate?.status,
      activeSellingContext.mandateStatus,
      activeSellingContext.mandate_status,
      activeSellingContext.signedMandateStatus,
      activeSellingContext.signed_mandate_status,
      activeSellingContext.mandatePacket?.state,
      activeSellingContext.mandatePacket?.signingStatus,
      activeSellingContext.mandatePacket?.signing_status,
      portal.mandate?.packet?.state,
      portal.mandate?.packet?.signingStatus,
      portal.mandate?.packet?.signing_status,
    ),
  )
}

function hasSignedMandateEvidence({ requirements = [], documents = [], listing = {}, activeSellingContext = {}, portal = {} } = {}) {
  const status = getMandateStatusFromSources({ listing, activeSellingContext, portal })
  return Boolean(
    hasCompletedRequirement(requirements, SELLER_BASE_PACK_KEYS.SIGNED_MANDATE) ||
      hasUploadedDocument(documents, SELLER_BASE_PACK_KEYS.SIGNED_MANDATE) ||
      SIGNED_MANDATE_STATUSES.has(status) ||
      activeSellingContext.signedMandateUploaded === true ||
      activeSellingContext.signed_mandate_uploaded === true ||
      activeSellingContext.mandatePacket?.finalSignedAccess?.available === true ||
      portal.mandate?.packet?.finalSignedAccess?.available === true,
  )
}

function hasListingShell({ listing = {}, activeSellingContext = {}, portal = {} } = {}) {
  return Boolean(firstText(
    listing.id,
    listing.listingId,
    listing.listing_id,
    listing.privateListingId,
    listing.private_listing_id,
    activeSellingContext.listingId,
    activeSellingContext.listing_id,
    portal.listing?.id,
    portal.unit?.id,
  ))
}

function hasRawListingLiveSignal({ listing = {}, activeSellingContext = {}, portal = {} } = {}) {
  const status = key(firstText(
    listing.listingStatus,
    listing.listing_status,
    listing.lifecycleStatus,
    listing.lifecycle_status,
    listing.status,
    activeSellingContext.listingStatus,
    activeSellingContext.listing_status,
    activeSellingContext.status,
    portal.unit?.status,
  ))
  const visibility = key(firstText(
    listing.listingVisibility,
    listing.listing_visibility,
    activeSellingContext.listingVisibility,
    activeSellingContext.listing_visibility,
  ))
  return Boolean(
    LIVE_LISTING_STATUSES.has(status) ||
      visibility === 'active_market' ||
      listing.isActive === true ||
      listing.is_active === true ||
      activeSellingContext.isActive === true ||
      activeSellingContext.is_active === true,
  )
}

function hasSellerOnboardingSubmitted({ listing = {}, activeSellingContext = {}, portal = {} } = {}) {
  const status = key(firstText(
    listing.sellerOnboardingStatus,
    listing.seller_onboarding_status,
    listing.sellerOnboarding?.status,
    listing.seller_onboarding?.status,
    activeSellingContext.sellerOnboardingStatus,
    activeSellingContext.seller_onboarding_status,
    portal.onboarding?.status,
    portal.onboardingFormData?.status,
  ))
  return ['submitted', 'under_review', 'completed', 'complete', 'reviewed', 'approved'].includes(status)
}

function getComplianceState(sellerComplianceSigning = null) {
  const state = sellerComplianceSigning?.signingState || sellerComplianceSigning || {}
  const signers = toArray(sellerComplianceSigning?.signers || state.signers)
  const requiredCount = Number(state.requiredCount || signers.filter((signer) => signer.required !== false).length || 0)
  const completedCount = Number(state.completedCount || signers.filter((signer) => signer.complete).length || 0)
  const remainingCount = Number(state.remainingCount || Math.max(requiredCount - completedCount, 0))
  return {
    required: Boolean(sellerComplianceSigning && requiredCount > 0),
    complete: Boolean(state.complete || sellerComplianceSigning?.complete || (requiredCount > 0 && remainingCount === 0)),
    status: key(state.status || sellerComplianceSigning?.status),
    percent: Number(state.percent || sellerComplianceSigning?.percent || (requiredCount ? Math.round((completedCount / requiredCount) * 100) : 0)),
    requiredCount,
    completedCount,
    remainingCount,
    signers,
    waitingOn: toArray(state.waitingOn),
  }
}

export function buildSellerComplianceAgentStatus({
  sellerComplianceSigning = null,
  requirements = [],
  documents = [],
  listing = {},
  activeSellingContext = {},
  portal = {},
} = {}) {
  const compliance = getComplianceState(sellerComplianceSigning)
  const signedMandate = hasSignedMandateEvidence({ requirements, documents, listing, activeSellingContext, portal })
  const onboardingSubmitted = hasSellerOnboardingSubmitted({ listing, activeSellingContext, portal })
  const listingDraftExists = hasListingShell({ listing, activeSellingContext, portal })
  const rawListingLiveSignal = hasRawListingLiveSignal({ listing, activeSellingContext, portal })
  const complianceComplete = !compliance.required || compliance.complete
  const canTreatListingAsCreated = signedMandate && listingDraftExists
  const canTreatListingAsLive = signedMandate && rawListingLiveSignal
  const canCreateListingDraft = Boolean(onboardingSubmitted || signedMandate)
  const canPublishListing = Boolean(signedMandate && complianceComplete && listingDraftExists)
  const blockers = [
    !onboardingSubmitted ? {
      key: 'seller_onboarding',
      label: 'Seller onboarding not submitted',
      action: 'Send or complete the seller onboarding before relying on captured seller data.',
    } : null,
    !signedMandate ? {
      key: SELLER_BASE_PACK_KEYS.SIGNED_MANDATE,
      label: 'Signed mandate still required',
      action: 'Upload the wet-ink signed mandate or record the mandate as signed before treating the listing as live.',
    } : null,
    compliance.required && !compliance.complete ? {
      key: 'seller_compliance_pack',
      label: 'Seller compliance signatures incomplete',
      action: sellerComplianceSigning?.nextMessage || 'Complete all required disclosure and FICA signatures.',
    } : null,
    !listingDraftExists ? {
      key: 'listing_draft',
      label: 'Listing draft not created',
      action: 'Create the listing draft from the seller workspace once the mandate is in place.',
    } : null,
  ].filter(Boolean)

  return {
    contract: SELLER_COMPLIANCE_AGENT_STATUS_MODEL_CONTRACT,
    onboardingSubmitted,
    signedMandate,
    complianceRequired: compliance.required,
    complianceComplete,
    listingDraftExists,
    rawListingLiveSignal,
    canCreateListingDraft,
    canPublishListing,
    canTreatListingAsCreated,
    canTreatListingAsLive,
    status: canTreatListingAsLive
      ? 'listing_live'
      : canTreatListingAsCreated
        ? 'listing_created'
        : signedMandate
          ? 'mandate_signed'
          : onboardingSubmitted
            ? 'seller_onboarding_submitted'
            : 'seller_onboarding_pending',
    readiness: [
      { key: 'onboarding', label: 'Onboarding', complete: onboardingSubmitted },
      { key: 'mandate', label: 'Mandate', complete: signedMandate },
      { key: 'fica', label: 'FICA', complete: complianceComplete && compliance.required },
      { key: 'disclosure', label: 'Disclosure', complete: complianceComplete && compliance.required },
      { key: 'listing_draft', label: 'Listing draft', complete: listingDraftExists },
    ],
    compliance,
    blockers,
    nextBlocker: blockers[0] || null,
  }
}
