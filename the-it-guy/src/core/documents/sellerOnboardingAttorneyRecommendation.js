export const SELLER_ONBOARDING_ATTORNEY_RECOMMENDATION_CONTRACT = 'arch9-seller-onboarding-attorney-recommendation-v1'
export const SELLER_ONBOARDING_ATTORNEY_CONSENT_STATUSES = Object.freeze({
  NOT_REQUESTED: 'not_requested',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  DEFERRED: 'deferred',
})

export const SELLER_ONBOARDING_ATTORNEY_CHOICE_DISCLOSURE_VERSION = 'arch9-conveyancing-attorney-choice-v1'
export const SELLER_ONBOARDING_ATTORNEY_INSTRUCTION_STATUSES = Object.freeze({
  NOT_APPLICABLE: 'not_applicable',
  AWAITING_SELLER_PREFERENCE: 'awaiting_seller_preference',
  SELLER_DECLINED: 'seller_declined',
  SELLER_DEFERRED: 'seller_deferred',
  AWAITING_MANDATE_SIGNATURE: 'awaiting_mandate_signature',
  AWAITING_AUTHORITY_REVIEW: 'awaiting_authority_review',
  READY_FOR_AGENCY_INSTRUCTION: 'ready_for_agency_instruction',
  AGENCY_INSTRUCTION_CONFIRMED: 'agency_instruction_confirmed',
})

function text(value) {
  return String(value ?? '').trim()
}

export function createSellerOnboardingAttorneyRecommendation({ partner = null, selectedAt = '', selectedBy = '' } = {}) {
  const source = partner && typeof partner === 'object' ? partner : {}
  const companyName = text(source.companyName || source.partnerName || source.name)
  const partnerOrganisationId = text(source.partnerOrganisationId || source.partnerOrganizationId || source.organisationId || source.organizationId)
  const selected = Boolean(companyName && partnerOrganisationId)
  const at = text(selectedAt) || new Date().toISOString()

  return {
    contract: SELLER_ONBOARDING_ATTORNEY_RECOMMENDATION_CONTRACT,
    status: selected ? 'recommended' : 'not_selected',
    selectionSource: selected ? 'agency_recommended' : 'not_selected',
    selectedAt: selected ? at : '',
    selectedBy: selected ? text(selectedBy) : '',
    partnerOptionId: selected ? text(source.id) : '',
    partnerConnectionId: selected ? text(source.connectionId) : '',
    partnerRelationshipId: selected ? text(source.relationshipId) : '',
    partnerRoleConfigurationId: selected ? text(source.partnerRoleConfigurationId) : '',
    preferredPartnerId: selected ? partnerOrganisationId : '',
    partnerOrganisationId: selected ? partnerOrganisationId : '',
    companyName: selected ? companyName : '',
    disclosureRequired: selected,
    sellerConsentStatus: SELLER_ONBOARDING_ATTORNEY_CONSENT_STATUSES.NOT_REQUESTED,
    instructionStatus: 'not_instructed',
  }
}

export function readSellerOnboardingAttorneyRecommendation(formData = {}) {
  const source = formData && typeof formData === 'object' ? formData : {}
  const recommendation = source.preferredTransferAttorneyRecommendation || source.preferred_transfer_attorney_recommendation || {}
  return recommendation && typeof recommendation === 'object' ? recommendation : {}
}

function partnerIdentity(recommendation = {}) {
  return text(recommendation?.partnerOrganisationId || recommendation?.preferredPartnerId || recommendation?.partnerOptionId)
}

function recommendationAuditSnapshot(recommendation = {}) {
  return {
    revision: Number(recommendation?.revision || 1),
    status: text(recommendation?.status),
    companyName: text(recommendation?.companyName),
    partnerOrganisationId: text(recommendation?.partnerOrganisationId || recommendation?.preferredPartnerId),
    partnerOptionId: text(recommendation?.partnerOptionId),
    sellerConsentStatus: getSellerOnboardingAttorneyConsentStatus(recommendation),
    instructionStatus: text(recommendation?.instructionStatus) || 'not_instructed',
    selectedAt: text(recommendation?.selectedAt),
  }
}

export function reviseSellerOnboardingAttorneyRecommendation({ current = {}, partner = null, revisedAt = '', revisedBy = '' } = {}) {
  const existing = current && typeof current === 'object' ? current : {}
  if (text(existing.instructionStatus) === SELLER_ONBOARDING_ATTORNEY_INSTRUCTION_STATUSES.AGENCY_INSTRUCTION_CONFIRMED) {
    throw new Error('This recommendation already has an agency instruction. Change it from the transaction instruction workflow instead.')
  }

  const replacement = createSellerOnboardingAttorneyRecommendation({
    partner,
    selectedAt: revisedAt,
    selectedBy: revisedBy,
  })
  const existingIdentity = partnerIdentity(existing)
  const replacementIdentity = partnerIdentity(replacement)
  const sameRecommendation = existing.status === replacement.status && existingIdentity === replacementIdentity
  if (sameRecommendation) return existing

  const history = Array.isArray(existing.recommendationRevisionHistory)
    ? existing.recommendationRevisionHistory
    : []
  const at = text(revisedAt) || new Date().toISOString()
  return {
    ...replacement,
    revision: Math.max(1, Number(existing.revision || 1) + 1),
    revisedAt: at,
    revisedBy: text(revisedBy),
    supersedes: recommendationAuditSnapshot(existing),
    recommendationRevisionHistory: [
      ...history,
      { ...recommendationAuditSnapshot(existing), supersededAt: at, supersededBy: text(revisedBy) },
    ],
  }
}

export function getSellerOnboardingAttorneyConsentStatus(recommendation = {}) {
  const value = text(recommendation?.sellerConsentStatus).toLowerCase()
  return Object.values(SELLER_ONBOARDING_ATTORNEY_CONSENT_STATUSES).includes(value)
    ? value
    : SELLER_ONBOARDING_ATTORNEY_CONSENT_STATUSES.NOT_REQUESTED
}

export function sellerOnboardingAttorneyRecommendationRequiresDecision(formData = {}) {
  const recommendation = readSellerOnboardingAttorneyRecommendation(formData)
  return recommendation.status === 'recommended' && Boolean(text(recommendation.companyName)) &&
    getSellerOnboardingAttorneyConsentStatus(recommendation) === SELLER_ONBOARDING_ATTORNEY_CONSENT_STATUSES.NOT_REQUESTED
}

export function resolveSellerOnboardingAttorneyChoiceAuthority({ recommendation = {}, signing = {} } = {}) {
  const current = recommendation && typeof recommendation === 'object' ? recommendation : {}
  const signers = Array.isArray(signing?.signers)
    ? signing.signers
    : Array.isArray(signing?.signingState?.signers)
      ? signing.signingState.signers
      : []
  const requiredSigners = signers.filter((signer) => signer?.required !== false)
  const primarySigner = requiredSigners[0] || signers[0] || {}
  const requiresAuthorityReview = Boolean(primarySigner?.authorityRequired || primarySigner?.authorityRequirement?.required)
  const requiresAllMandateSigners = requiredSigners.length > 1

  return {
    applicable: current.status === 'recommended' && Boolean(text(current.companyName)),
    responseScope: 'seller_preference_only',
    responseSignerId: text(primarySigner?.id),
    responseSignerName: text(primarySigner?.name || primarySigner?.roleLabel),
    responseSignerRole: text(primarySigner?.role),
    responseSignerRoleLabel: text(primarySigner?.roleLabel || primarySigner?.role),
    responseSignerCapacity: text(primarySigner?.capacity),
    requiredMandateSignerCount: requiredSigners.length,
    requiredMandateSigners: requiredSigners.map((signer) => ({
      id: text(signer?.id),
      name: text(signer?.name || signer?.roleLabel),
      role: text(signer?.role),
      roleLabel: text(signer?.roleLabel || signer?.role),
    })),
    requiresAllMandateSigners,
    requiresAuthorityReview,
    authorityRequirement: requiresAuthorityReview
      ? {
          key: text(primarySigner?.authorityRequirement?.key),
          label: text(primarySigner?.authorityRequirement?.label || 'Signing authority'),
        }
      : null,
    instructionStatus: 'not_instructed',
  }
}

function hasSignedMandate(mandate = {}) {
  const status = text(mandate?.status).toLowerCase()
  return Boolean(
    mandate?.isSigned ||
    mandate?.signedAt ||
    mandate?.signedDate ||
    ['signed', 'signed_uploaded', 'completed', 'fully_signed', 'uploaded_signed', 'mandate_signed'].includes(status),
  )
}

function hasApprovedChoiceAuthority(authority = {}, signing = {}) {
  if (!authority?.requiresAuthorityReview) return true
  const signers = Array.isArray(signing?.signers)
    ? signing.signers
    : Array.isArray(signing?.signingState?.signers)
      ? signing.signingState.signers
      : []
  const signer = signers.find((candidate) => text(candidate?.id) === text(authority.responseSignerId)) || {}
  const status = text(signer?.status).toLowerCase()
  const reviewStatus = text(signer?.authority?.reviewStatus || signer?.authority?.review_status).toLowerCase()
  return status === 'skipped_by_authority' || reviewStatus === 'approved'
}

export function buildSellerOnboardingAttorneyInstructionReadiness({ recommendation = {}, mandate = {}, signing = {} } = {}) {
  const current = recommendation && typeof recommendation === 'object' ? recommendation : {}
  const authority = current.sellerChoiceAuthority && typeof current.sellerChoiceAuthority === 'object'
    ? current.sellerChoiceAuthority
    : resolveSellerOnboardingAttorneyChoiceAuthority({ recommendation: current, signing })
  const consentStatus = getSellerOnboardingAttorneyConsentStatus(current)
  const mandateSigned = hasSignedMandate(mandate)
  const authorityApproved = hasApprovedChoiceAuthority(authority, signing)
  const confirmed = text(current.instructionStatus) === SELLER_ONBOARDING_ATTORNEY_INSTRUCTION_STATUSES.AGENCY_INSTRUCTION_CONFIRMED
  let status = SELLER_ONBOARDING_ATTORNEY_INSTRUCTION_STATUSES.NOT_APPLICABLE
  let reason = 'No conveyancing attorney recommendation was selected.'

  if (current.status === 'recommended' && text(current.companyName)) {
    if (confirmed) {
      status = SELLER_ONBOARDING_ATTORNEY_INSTRUCTION_STATUSES.AGENCY_INSTRUCTION_CONFIRMED
      reason = 'An agency instruction has been recorded separately from seller onboarding.'
    } else if (consentStatus === SELLER_ONBOARDING_ATTORNEY_CONSENT_STATUSES.NOT_REQUESTED) {
      status = SELLER_ONBOARDING_ATTORNEY_INSTRUCTION_STATUSES.AWAITING_SELLER_PREFERENCE
      reason = 'Wait for the seller to record a preference.'
    } else if (consentStatus === SELLER_ONBOARDING_ATTORNEY_CONSENT_STATUSES.DECLINED) {
      status = SELLER_ONBOARDING_ATTORNEY_INSTRUCTION_STATUSES.SELLER_DECLINED
      reason = 'The seller chose to nominate another conveyancer.'
    } else if (consentStatus === SELLER_ONBOARDING_ATTORNEY_CONSENT_STATUSES.DEFERRED) {
      status = SELLER_ONBOARDING_ATTORNEY_INSTRUCTION_STATUSES.SELLER_DEFERRED
      reason = 'The seller chose to decide on a conveyancer later.'
    } else if (!mandateSigned) {
      status = SELLER_ONBOARDING_ATTORNEY_INSTRUCTION_STATUSES.AWAITING_MANDATE_SIGNATURE
      reason = 'Wait for the mandate to be fully signed before creating an attorney instruction.'
    } else if (!authorityApproved) {
      status = SELLER_ONBOARDING_ATTORNEY_INSTRUCTION_STATUSES.AWAITING_AUTHORITY_REVIEW
      reason = 'The seller representative’s authority still needs agency review.'
    } else {
      status = SELLER_ONBOARDING_ATTORNEY_INSTRUCTION_STATUSES.READY_FOR_AGENCY_INSTRUCTION
      reason = 'The agency may create a separate attorney instruction when the transaction requires it.'
    }
  }

  return {
    status,
    reason,
    companyName: text(current.companyName),
    sellerConsentStatus: consentStatus,
    mandateSigned,
    authorityRequired: Boolean(authority?.requiresAuthorityReview),
    authorityApproved,
    requiresExplicitAgencyAction: status === SELLER_ONBOARDING_ATTORNEY_INSTRUCTION_STATUSES.READY_FOR_AGENCY_INSTRUCTION,
    canCreateAgencyInstruction: status === SELLER_ONBOARDING_ATTORNEY_INSTRUCTION_STATUSES.READY_FOR_AGENCY_INSTRUCTION,
    instructionStatus: text(current.instructionStatus) || 'not_instructed',
    authority,
  }
}

export function confirmSellerOnboardingAttorneyInstruction({ recommendation = {}, readiness = {}, instructedAt = '', instructedBy = '' } = {}) {
  const current = recommendation && typeof recommendation === 'object' ? recommendation : {}
  if (!readiness?.canCreateAgencyInstruction) {
    throw new Error('The mandate, seller preference, and any required authority review must be complete before an attorney instruction can be recorded.')
  }

  return {
    ...current,
    instructionStatus: SELLER_ONBOARDING_ATTORNEY_INSTRUCTION_STATUSES.AGENCY_INSTRUCTION_CONFIRMED,
    agencyInstructionConfirmedAt: text(instructedAt) || new Date().toISOString(),
    agencyInstructionConfirmedBy: text(instructedBy),
    // This records the decision only. Allocation and firm communication remain
    // separate, transaction-scoped actions.
    allocationStatus: 'not_allocated',
  }
}

export function recordSellerOnboardingAttorneyConsent({ recommendation = {}, decision = '', decidedAt = '', decidedBy = '', authority = null } = {}) {
  const current = recommendation && typeof recommendation === 'object' ? recommendation : {}
  const consentStatus = getSellerOnboardingAttorneyConsentStatus({ sellerConsentStatus: decision })

  if (current.status !== 'recommended' || !text(current.companyName) || consentStatus === SELLER_ONBOARDING_ATTORNEY_CONSENT_STATUSES.NOT_REQUESTED) {
    return current
  }

  return {
    ...current,
    sellerConsentStatus: consentStatus,
    sellerConsentRecordedAt: text(decidedAt) || new Date().toISOString(),
    sellerConsentRecordedBy: text(decidedBy) || 'seller_onboarding',
    sellerChoiceDisclosureVersion: SELLER_ONBOARDING_ATTORNEY_CHOICE_DISCLOSURE_VERSION,
    sellerChoiceAuthority: authority && typeof authority === 'object' ? authority : current.sellerChoiceAuthority || null,
    // The seller's response is deliberately not an attorney instruction.
    instructionStatus: 'not_instructed',
  }
}
